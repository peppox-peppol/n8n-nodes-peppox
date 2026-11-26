import type { IDataObject, INodeExecutionData, INodeType, INodeTypeDescription, IPollFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

type DocumentKind = 'received' | 'sent';

function rowsFrom(response: unknown): Record<string, unknown>[] {
	if (Array.isArray(response)) return response.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
	if (!response || typeof response !== 'object') return [];
	const obj = response as Record<string, unknown>;
	for (const key of ['data', 'documents', 'results', 'items']) {
			if (Array.isArray(obj[key])) return (obj[key] as unknown[]).filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
	}
	if (obj.data && typeof obj.data === 'object') return rowsFrom(obj.data);
	return [];
}

function documentKey(row: Record<string, unknown>): string {
	return String(row.flowin_document_id ?? row.document_id ?? row.invoice_guid ?? row.documentId ?? row.id ?? '');
}

function sanitizedError(error: unknown, apiKey: string): string {
	let message = error instanceof Error ? error.message : 'Erreur de communication avec Peppox.';
	if (apiKey) message = message.split(apiKey).join('[REDACTED]');
	return message.replace(/(apikey|api_key|supplier_id|idsupplier)=([^&\s]+)/gi, '$1=[REDACTED]');
}

export class PeppoxTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Peppox Trigger',
		name: 'peppoxTrigger',
		icon: 'file:peppox.svg',
		group: ['trigger'],
		version: 1,
		usableAsTool: true,
		description: 'Détecter par interrogation périodique les nouveaux documents Peppol reçus ou envoyés.',
		defaults: { name: 'Peppox Trigger' },
		inputs: [],
		outputs: ['main'],
		credentials: [{ name: 'peppoxApi', required: true }],
		polling: true,
		properties: [
			{
				displayName: 'Poll Times',
				name: 'pollTimes',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				default: { item: [{ mode: 'everyMinute' }] },
				options: [{
					name: 'item',
					displayName: 'Item',
					values: [{
						displayName: 'Mode',
						name: 'mode',
						type: 'options',
						options: [
							{ name: 'Every Minute', value: 'everyMinute' },
							{ name: 'Every 5 Minutes', value: 'everyFiveMinutes' },
							{ name: 'Every 15 Minutes', value: 'everyFifteenMinutes' },
							{ name: 'Every Hour', value: 'everyHour' },
						],
						default: 'everyMinute',
					}],
				}],
			},
			{
				displayName: 'Watch',
				name: 'documentKind',
				type: 'options',
				options: [
					{ name: 'New received documents', value: 'received' },
					{ name: 'New sent documents', value: 'sent' },
				],
				default: 'received',
				required: true,
			},
			{
				displayName: 'Rows per Poll',
				name: 'perPage',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 300 },
				default: 100,
				description: 'Nombre maximum de documents récents récupérés à chaque interrogation (maximum API : 300).',
			},
			{
				displayName: 'Additional Filters (JSON)',
				name: 'filters',
				type: 'json',
				typeOptions: { rows: 5 },
				default: '{}',
				description: 'Filtres Peppox, par exemple {"document_type_code":"380"} pour les factures reçues. N’incluez pas supplier_id.',
			},
		],
	};

	async poll(this: IPollFunctions) {
		const credentials = await this.getCredentials('peppoxApi');
		const kind = this.getNodeParameter('documentKind') as DocumentKind;
		const perPage = Math.min(300, Math.max(1, Number(this.getNodeParameter('perPage', 100))));
		const rawFilters = this.getNodeParameter('filters', '{}') as string | Record<string, unknown>;
		let filters: Record<string, unknown>;
		try {
				filters = (typeof rawFilters === 'string' ? JSON.parse(rawFilters) : rawFilters) as Record<string, unknown>;
		} catch {
			throw new NodeOperationError(this.getNode(), 'Additional Filters doit contenir un objet JSON valide.');
		}
		const baseUrl = String(credentials.baseUrl ?? 'https://api.peppox.com').replace(/\/+$/, '');
		const apiKey = String(credentials.apiKey ?? '');
		const endpoint = kind === 'received' ? '/doc-received/header/list/' : '/doc-sent/header/list/';
		const store = this.getWorkflowStaticData('node');
		const seen = (store.seenDocumentKeys ?? {}) as Record<string, true>;
		const initialized = store.baselined === true;
		try {
			const output: INodeExecutionData[] = [];
			const freshKeys: Record<string, true> = {};
			const sortBy = kind === 'received' ? 'api_created_at' : 'sent_at';
			let foundExistingBoundary = false;
			const maxPagesPerPoll = 5;
			for (let page = 1; page <= maxPagesPerPoll && !foundExistingBoundary; page++) {
				// The polling endpoint authenticates through supplier_id; credentials are already stored by n8n.
				// eslint-disable-next-line @n8n/community-nodes/no-http-request-with-manual-auth
				const response = await this.helpers.httpRequest({
					method: 'GET',
					url: baseUrl + endpoint,
					qs: { ...filters, supplier_id: apiKey, page, per_page: perPage, sort_by: sortBy, sort_dir: 'DESC' },
					json: true,
					timeout: 60000,
				});
				const rows = rowsFrom(response);
				if (!rows.length) break;
				for (const row of rows) {
					const key = documentKey(row);
					if (!key) continue;
					if (seen[key]) {
						foundExistingBoundary = true;
						break;
					}
					if (initialized) output.push({ json: row as IDataObject });
					freshKeys[key] = true;
				}
				if (rows.length < perPage) break;
			}
			store.seenDocumentKeys = { ...seen, ...freshKeys };
			const keys = Object.keys(store.seenDocumentKeys as Record<string, true>);
			if (keys.length > 1200) store.seenDocumentKeys = Object.fromEntries(keys.slice(-1200).map((key) => [key, true]));
			store.baselined = true;
			return output.length ? [output] : null;
		} catch (error) {
			const message = sanitizedError(error, apiKey);
			throw new NodeOperationError(this.getNode(), 'Peppox Trigger: ' + message);
		}
	}
}
