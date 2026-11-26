import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

type ApiOperation = { name: string; path: string; method: 'GET' | 'POST'; auth: 'supplier_id' | 'idsupplier' | 'apikey' | 'none'; file?: boolean; fileResponse?: boolean };

const operations: ApiOperation[] = [
	{ name: 'Upload PDF to PDF2Peppol', path: '/pdf2peppol/add/', method: 'POST', auth: 'supplier_id', file: true },
	{ name: 'Check PDF2Peppol conversion', path: '/pdf2peppol/check/', method: 'GET', auth: 'supplier_id' },
	{ name: 'Confirm PDF2Peppol document', path: '/pdf2peppol/confirm/', method: 'POST', auth: 'supplier_id' },
	{ name: 'Send confirmed PDF2Peppol document', path: '/pdf2peppol/send/', method: 'POST', auth: 'supplier_id' },
	{ name: 'Create sales invoice header', path: '/invoice/add/', method: 'POST', auth: 'apikey' },
	{ name: 'Add sales invoice line', path: '/invoice_line/add/', method: 'POST', auth: 'apikey' },
	{ name: 'Attach PDF to sales invoice', path: '/invoice_attach_pdf/add/', method: 'POST', auth: 'apikey', file: true },
	{ name: 'Generate XML and submit sales invoice', path: '/xml/generate/', method: 'POST', auth: 'apikey' },
	{ name: 'Create credit note header', path: '/creditnote/add/', method: 'POST', auth: 'apikey' },
	{ name: 'Add credit note line', path: '/creditnote_line/add/', method: 'POST', auth: 'apikey' },
	{ name: 'Attach PDF to credit note', path: '/creditnote_attach_pdf/add/', method: 'POST', auth: 'apikey', file: true },
	{ name: 'Generate XML and submit credit note', path: '/xml/generate/', method: 'POST', auth: 'apikey' },
	{ name: 'List structured invoice records', path: '/invoice/list/', method: 'GET', auth: 'apikey' },
	{ name: 'List sent document headers', path: '/doc-sent/header/list/', method: 'GET', auth: 'supplier_id' },
	{ name: 'List sent document lines', path: '/doc-sent/lines/list/', method: 'GET', auth: 'supplier_id' },
	{ name: 'List received document headers', path: '/doc-received/header/list/', method: 'GET', auth: 'supplier_id' },
	{ name: 'List received document lines', path: '/doc-received/lines/list/', method: 'GET', auth: 'supplier_id' },
	{ name: 'Download PDF for received document', path: '/box/pdf/', method: 'GET', auth: 'idsupplier', fileResponse: true },
	{ name: 'Check Peppol participant', path: '/ap/get/', method: 'GET', auth: 'none' },
];

function safeErrorMessage(error: unknown, apiKey = ''): string {
	const candidate = error as { message?: string; response?: { status?: number; data?: unknown } };
	const status = candidate?.response?.status;
	const data = candidate?.response?.data;
	let detail = '';
	if (typeof data === 'string') detail = data.slice(0, 500);
	else if (data && typeof data === 'object') {
		const obj = data as Record<string, unknown>;
		detail = String(obj.message ?? obj.error ?? obj.detail ?? '').slice(0, 500);
	}
	let summary = detail || candidate?.message || 'La requête Peppox a échoué.';
	if (apiKey) summary = summary.split(apiKey).join('[REDACTED]');
	summary = summary.replace(/(apikey|api_key|supplier_id|idsupplier)=([^&\s]+)/gi, '$1=[REDACTED]');
	return status ? 'Peppox API HTTP ' + status + ': ' + summary : summary;
}

export class Peppox implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Peppox',
		name: 'peppox',
		icon: 'file:peppox.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Créer, envoyer, consulter et rechercher des documents Peppol avec Peppox.',
		defaults: { name: 'Peppox' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'peppoxApi', required: false }],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: operations.map((operation) => ({ name: operation.name, value: operation.name, description: operation.method + ' ' + operation.path })),
				default: operations[0].name,
				required: true,
			},
			{
				displayName: 'Request Parameters (JSON)',
				name: 'requestParameters',
				type: 'json',
				typeOptions: { rows: 8 },
				default: '{}',
				description: 'Champs métier, filtres ou identifiants du document. Exemples: {"invoice_guid":"..."} ou {"page":1,"per_page":50,"date_from":"2026-09-01"}. La clé API est ajoutée depuis les identifiants n8n.',
			},
			{
				displayName: 'PDF Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				displayOptions: { show: { operation: operations.filter((operation) => operation.file).map((operation) => operation.name) } },
				default: 'data',
				description: 'Nom de la propriété binaire contenant le PDF. Le fichier est encodé en Base64. Limite Peppox : 15 MB.',
			},
			{
				displayName: 'Response Field',
				name: 'responseField',
				type: 'string',
				default: 'peppox',
				description: 'Nom de la propriété JSON qui contiendra la réponse Peppox.',
			},
			{
				displayName: 'PDF Binary Output Property',
				name: 'binaryOutputProperty',
				type: 'string',
				displayOptions: { show: { operation: ['Download PDF for received document'] } },
				default: 'data',
				description: 'Nom de la propriété binaire n8n qui recevra le PDF téléchargé.',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			let apiKey = '';
			try {
				const operationName = this.getNodeParameter('operation', i) as string;
				const operation = operations.find((candidate) => candidate.name === operationName);
				if (!operation) throw new Error('Operation Peppox inconnue.');
				const credentials = await this.getCredentials('peppoxApi').catch(() => ({} as IDataObject));
				apiKey = String(credentials.apiKey ?? '').trim();
				const baseUrl = String(credentials.baseUrl ?? 'https://api.peppox.com').replace(/\/+$/, '');
				if (operation.auth !== 'none' && !apiKey) throw new Error('Sélectionnez les identifiants Peppox API et renseignez la clé API du compte.');

				const rawParameters = this.getNodeParameter('requestParameters', i, '{}') as string | Record<string, unknown>;
				let parameters: IDataObject;
				try {
					parameters = (typeof rawParameters === 'string' ? JSON.parse(rawParameters) : rawParameters) as IDataObject;
				} catch {
					throw new Error('Request Parameters doit contenir un objet JSON valide.');
				}
				if (!parameters || Array.isArray(parameters) || typeof parameters !== 'object') throw new Error('Request Parameters doit être un objet JSON.');

				const query: IDataObject = {};
			let body: IDataObject | undefined;
				if (operation.method === 'GET') Object.assign(query, parameters);
				else body = { ...parameters };

				if (operation.auth === 'supplier_id') {
					if (operation.method === 'GET') query.supplier_id = apiKey;
					else body!.supplier_id = apiKey;
				} else if (operation.auth === 'idsupplier') {
					query.idsupplier = apiKey;
				} else if (operation.auth === 'apikey') {
					if (operation.method === 'GET') query.apikey = apiKey;
					else body!.apikey = apiKey;
				}

				if (operation.file) {
					const propertyName = this.getNodeParameter('binaryPropertyName', i, 'data') as string;
					const binary = items[i].binary?.[propertyName];
					if (binary) {
						const buffer = await this.helpers.getBinaryDataBuffer(i, propertyName);
						if (buffer.length > 15 * 1024 * 1024) throw new Error('Le PDF dépasse la limite Peppox de 15 MB.');
						if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('Le fichier binaire fourni ne porte pas une signature PDF valide.');
						body ??= {};
						body.pdf_base64 = buffer.toString('base64');
						if (binary.fileName) body.filename = binary.fileName;
					} else if (!parameters.pdf_base64 && !parameters.content_base64 && !parameters.pdf_url && !parameters.file_url && !parameters.url) {
						throw new Error('Fichier PDF absent. Fournissez le binaire choisi ou un champ pdf_base64/pdf_url.');
					}
				}
				if (operation.path === '/pdf2peppol/add/' && body && body.network === undefined && query.network === undefined) {
					body.network = 'integration';
				}

				const response = await this.helpers.httpRequest({
					method: operation.method,
					url: baseUrl + operation.path,
					qs: query,
					body,
					json: !operation.fileResponse,
					encoding: operation.fileResponse ? 'arraybuffer' : undefined,
					returnFullResponse: false,
					timeout: 60000,
				});
				const responseField = this.getNodeParameter('responseField', i, 'peppox') as string;
				if (operation.fileResponse) {
					const buffer = Buffer.isBuffer(response) ? response : Buffer.from(response as ArrayBuffer);
					if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
						throw new Error('Peppox n’a pas renvoyé un PDF. Vérifiez documentId, idsupplier et type_flowin.');
					}
					const binaryProperty = this.getNodeParameter('binaryOutputProperty', i, 'data') as string;
					const fileName = String(parameters.documentId ?? parameters.document_id ?? 'peppox-document') + '.pdf';
					const binary = await this.helpers.prepareBinaryData(buffer, fileName, 'application/pdf');
					returnData.push({
						json: { ...items[i].json, [responseField || 'peppox']: { downloaded: true, fileName } },
						binary: { [binaryProperty || 'data']: binary },
						pairedItem: { item: i },
					});
				} else {
					returnData.push({ json: { ...items[i].json, [responseField || 'peppox']: response as IDataObject }, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { ...items[i].json, error: safeErrorMessage(error) }, pairedItem: { item: i } });
					continue;
				}
				throw new NodeOperationError(this.getNode(), safeErrorMessage(error, apiKey), { itemIndex: i });
			}
		}
		return [returnData];
	}
}
