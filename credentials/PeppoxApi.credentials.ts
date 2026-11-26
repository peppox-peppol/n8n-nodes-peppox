import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class PeppoxApi implements ICredentialType {
	name = 'peppoxApi';
	displayName = 'Peppox API';
	icon = 'file:peppox.svg' as const;
	documentationUrl = 'https://peppox.com/api-doc/';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key / supplier_id',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Clé API du compte Company. Elle est transmise côté serveur comme apikey ou supplier_id selon le endpoint.',
		},
		{
			displayName: 'API Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.peppox.com',
			required: true,
			description: 'Laissez la valeur par défaut pour la production. Utilisez une URL de test uniquement si Peppox vous en a fourni une.',
		},
	];
	test = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/doc-sent/header/list/',
			qs: { supplier_id: '={{$credentials.apiKey}}', page: 1, per_page: 1 },
		},
	};
}
