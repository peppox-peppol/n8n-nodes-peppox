# Peppox API operations available in the n8n node

Base URL: https://api.peppox.com

The credential key is sent as supplier_id for PDF2Peppol and sent/received document endpoints, and as apikey for structured invoice operations and /invoice/list/. /ap/get/ is a public lookup.

## PDF2Peppol: PDF to Peppol

| Action | API | Required request fields |
| --- | --- | --- |
| Upload PDF to PDF2Peppol | POST /pdf2peppol/add/ | PDF binary (data by default), or pdf_base64 / pdf_url; optionally document_type_code (380 invoice, 381 credit note), network (integration or production), filename |
| Check conversion | GET /pdf2peppol/check/ | queue_guid |
| Confirm | POST /pdf2peppol/confirm/ | queue_guid |
| Send confirmed document | POST /pdf2peppol/send/ | queue_guid |

Use the queue_guid returned from upload in all following calls. Check conversion until ready, review the extracted data, then confirm and send. Peppox documents a maximum PDF size of 15 MB.

Example upload parameters:

    {"document_type_code":"380","network":"integration"}

Example check, confirm or send parameters:

    {"queue_guid":"QUEUE_GUID_FROM_UPLOAD"}

## Sales invoices

| Action | API | Required / common request fields |
| --- | --- | --- |
| Create header | POST /invoice/add/ | inv_id, issue_date, customer.endpoint_id, customer.name, buyer address fields |
| Add a line | POST /invoice_line/add/ | invoice_guid, quantity, unit_code, price_amount, item name/description, tax_percent |
| Attach PDF | POST /invoice_attach_pdf/add/ | invoice_guid plus PDF binary or pdf_base64 / pdf_url |
| Generate XML and submit | POST /xml/generate/ | invoice_guid |

Header example:

    {
      "inv_id": "INV-2026-0042",
      "issue_date": "2026-09-11",
      "currency": "EUR",
      "customer": {
        "endpoint_scheme": "0208",
        "endpoint_id": "0123456789",
        "name": "Buyer Ltd",
        "street": "Main Street 1",
        "city": "Brussels",
        "postal": "1000",
        "country": "BE"
      }
    }

Line example:

    {
      "invoice_guid": "INVOICE_GUID_FROM_HEADER",
      "line_id": "1",
      "quantity": "2",
      "unit_code": "C62",
      "price_amount": "49.50",
      "item_name": "Consulting",
      "item_description": "Consulting service",
      "tax_percent": "21"
    }

The header defaults to invoice type 380 and currency EUR. The seller identity and seller IBAN are taken from the configured Company profile. Add every line before generating XML. /xml/generate/ is the final structured-invoice call; a separate structured send endpoint is not documented.

## Credit notes

| Action | API | Required / common request fields |
| --- | --- | --- |
| Create header | POST /creditnote/add/ | creditnote_id, issue_date, customer identity and address |
| Add a line | POST /creditnote_line/add/ | creditnote_guid, quantity, price_amount; normally also unit_code, item details and tax_percent |
| Attach PDF | POST /creditnote_attach_pdf/add/ | creditnote_guid plus PDF binary or Base64/URL |
| Generate XML and submit | POST /xml/generate/ | creditnote_guid |

The credit-note document type defaults to 381. Complete all lines before generating XML. /xml/generate/ uses the credit-note GUID to select the credit-note flow.

## Lists and document details

| Action | API | Main filters/identifiers |
| --- | --- | --- |
| List structured invoice records | GET /invoice/list/ | profile, fields, invoice_guid, inv_id, status, network, from, to, limit, offset |
| List sent document headers | GET /doc-sent/header/list/ | page, per_page (max 300), q, date range, date_field, status, local_status, sort_by, sort_dir |
| List sent lines | GET /doc-sent/lines/list/ | invoice_guid, optional q, page, per_page (max 300) |
| List received headers | GET /doc-received/header/list/ | page, per_page (max 300), q, date range, date_field, import_status, document_type_code, sorting |
| List received lines | GET /doc-received/lines/list/ | document_id, optional q, page, per_page, sorting |
| Download received PDF | GET /box/pdf/ | documentId, type_flowin (when required by the account/environment); idsupplier is added from credentials |

Example received invoice filter:

    {"document_type_code":"380","date_from":"2026-09-01","page":1,"per_page":50}

Use document_id from the received-header response when listing received lines. Use invoice_guid from the sent-header response when listing sent lines. Status lists accept comma, semicolon or pipe separators where documented. Keep include_raw disabled unless raw upstream data is needed.

For a received PDF, pass the document identifier as documentId and the appropriate environment as type_flowin. The node returns the PDF as binary data (data by default), ready to save or attach to an email.

## Peppol participant lookup

GET /ap/get/ accepts scheme and value; optional parameters include sml (digitprod or digittest), withEndpoints, pretty, and only=name.

    {"scheme":"0208","value":"0123456789","sml":"digitprod","withEndpoints":true}

This checks whether a participant is discoverable; it does not create an account or send a document.

## Operational cautions

- Keep the API key in n8n credentials.
- Use the Peppox integration environment for development.
- Do not automatically confirm/send an extracted PDF before checking its data and business approval.
- The published reference mentions webhooks as a capability but currently does not list a webhook subscription endpoint. Use the polling trigger until Peppox publishes the concrete webhook contract.
