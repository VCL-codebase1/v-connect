export function renderMessage(template,recipient) {
  const values={name:recipient.name??'',...(recipient.variables??{})};
  return template.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g,(_,key)=>String(values[key]??''));
}

export function providerMessageId(payload) {
  const value=payload?.key?.id??payload?.messageId??payload?.id;
  return typeof value==='string'?value.slice(0,240):null;
}

export function retryableStatus(status) { return status===429||status>=500; }
