# Peppox nodes for n8n

Community-node package for connecting n8n workflows to the Peppox Peppol API.

## Included

- **Peppox** action node: PDF2Peppol, structured sales invoices and credit notes, document listing, line retrieval, and Peppol participant lookup.
- **Peppox Trigger**: polling trigger for newly received or sent document headers.
- **Peppox API** credential: stores the Company API key in n8n credentials and uses the correct apikey or supplier_id parameter per endpoint.

The node follows Peppox's published endpoint reference. It does not embed an API key or connect directly to a database.

## Create the credential

Create a credential named **Peppox API** in n8n:

1. **API Key / supplier_id**: use the Company API key from the Peppox dashboard.
2. **API Base URL**: keep https://api.peppox.com for production.

n8n stores the key in its credential store. The node adds it to API requests server-side and does not copy it to the workflow output.

## Use the PDF2Peppol path

1. Send a PDF binary into **Peppox → Upload PDF to PDF2Peppol**. The default binary property name is data; change it if the incoming binary uses another property.
2. Pass the returned queue_guid into **Check PDF2Peppol conversion** as {"queue_guid":"..."}. The response includes extraction results and ready_for_peppol.
3. Review extracted supplier/customer data, totals, taxes and lines in your workflow or human-approval step.
4. Only after approval, run **Confirm PDF2Peppol document**, then **Send confirmed PDF2Peppol document**, each with the same queue_guid.

For sandbox work, upload with {"network":"integration","document_type_code":"380"} (or 381 for a credit note). Set network to production only in a workflow intended to transmit real documents.

Uploading a PDF does not itself send it. Confirmation and sending are separate operations. The node refuses a binary larger than 15 MB or without a PDF signature.

## Use structured invoices or credit notes

For a sales invoice, call these actions in order:

1. **Create sales invoice header**. Provide inv_id, issue_date, customer and applicable payment/delivery fields.
2. **Add sales invoice line** once per line, using the invoice_guid returned by the header call.
3. Optionally use **Attach PDF to sales invoice**.
4. **Generate XML and submit sales invoice**, with the same invoice_guid.

For a credit note, use the matching credit-note header, line and attachment actions, then **Generate XML and submit credit note** with the creditnote_guid. Peppox generates the UBL XML; if valid, /xml/generate/ continues the configured submission to Peppol. There is no separate structured /send action.

## Poll for documents

Add **Peppox Trigger**, choose new received or sent documents, and set the n8n polling interval in the trigger's Polling settings. On its first poll, it records up to five recent pages as a baseline and emits no historical items. Later polls emit unseen document IDs until an already-seen item is reached (up to five pages per poll). Add filters such as {"document_type_code":"380"} to the received-documents trigger.

This is polling, not push delivery. A server-side Peppox webhook subscription endpoint is not present in the published endpoint reference. The trigger detects new documents; it does not emit status changes for an existing document. The action node also downloads an available received PDF from /box/pdf/.

## Operations

| Group | Actions |
| --- | --- |
| PDF2Peppol | Upload PDF, check conversion, confirm, send |
| Sales invoice | Create header, add line, attach PDF, generate XML and submit |
| Credit note | Create header, add line, attach PDF, generate XML and submit |
| Documents | List structured invoices, sent headers/lines, received headers/lines |
| Network | Check a Peppol participant |

See docs/endpoint-map.md for parameters and examples.

To add a notification after the trigger, connect an Email Send, Microsoft Outlook, Slack or other n8n node and map the fields prepared by the example workflow. Configure that service's credentials separately in n8n.

## Build

Prerequisites: Node.js 20.15 or newer and npm.

    npm install
    npm run build

For local development, build this package and install it using the community-node or custom-extension method supported by your n8n deployment. For an npm installation, publish it to a registry accessible to your n8n instance, then install n8n-nodes-peppox from Settings → Community nodes on self-hosted n8n.

Do not place the API key in workflow JSON, expressions, browser code or checked-in environment files. Use n8n credentials.

## Scope

This package calls Peppox's public API. It does not manage supplier onboarding, customer accounts, subscription billing or API-key creation. It also does not configure Peppox-side webhooks.
