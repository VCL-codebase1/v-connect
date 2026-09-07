import { authorize, body, failure, json, ApiError } from '@/lib/api';
import { audienceAction, workspaceId } from '@/lib/validation';

export async function GET(request: Request) {
  try {
    const target = workspaceId.parse(new URL(request.url).searchParams.get('workspaceId'));
    const { db } = await authorize(target);
    const [listsResult,contactsResult,templatesResult,suppressionsResult] = await Promise.all([
      db.from('vc_contact_lists').select('id,name,description,created_at').eq('workspace_id',target).order('created_at',{ascending:false}),
      db.from('vc_list_contacts').select('list_id,phone,name,variables').eq('workspace_id',target).limit(10000),
      db.from('vc_message_templates').select('id,name,body,created_at,updated_at').eq('workspace_id',target).order('updated_at',{ascending:false}),
      db.from('vc_suppressions').select('phone,reason,created_at').eq('workspace_id',target).order('created_at',{ascending:false}).limit(1000),
    ]);
    if (listsResult.error || contactsResult.error || templatesResult.error || suppressionsResult.error) throw new ApiError(500,'Audience data could not be loaded. Apply migration 008 first.');
    const contacts = contactsResult.data ?? [];
    const lists = (listsResult.data ?? []).map(list => ({ ...list, contact_count: contacts.filter(contact => contact.list_id===list.id).length, contacts: contacts.filter(contact => contact.list_id===list.id).map(({phone,name,variables}) => ({phone,name,variables})) }));
    return json({ lists, templates: templatesResult.data ?? [], suppressions: suppressionsResult.data ?? [] });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const input = audienceAction.parse(await body(request,750000));
    const { db } = await authorize(input.workspaceId,true);
    if (input.action === 'createList') {
      const { data: id,error } = await db.rpc('vc_create_contact_list',{ target:input.workspaceId,list_name:input.name,list_description:input.description,contacts:input.contacts });
      if (error || !id) throw new ApiError(400,error?.message ?? 'Contact list could not be created.');
      return json({id},201);
    }
    if (input.action === 'createTemplate') {
      const { data:id,error } = await db.rpc('vc_create_message_template',{ target:input.workspaceId,template_name:input.name,template_body:input.text });
      if (error || !id) throw new ApiError(400,error?.message ?? 'Template could not be created.');
      return json({id},201);
    }
    const { error } = await db.rpc('vc_set_suppression',{ target:input.workspaceId,recipient_phone:input.phone,suppression_reason:input.reason,suppressed:input.suppressed });
    if (error) throw new ApiError(400,error.message);
    return json({ok:true});
  } catch (error) { return failure(error); }
}
