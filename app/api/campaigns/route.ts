import { authorize, body, failure, json, ApiError } from '@/lib/api';
import { campaignAction, workspaceId } from '@/lib/validation';
import { validateMediaUrl } from '@/lib/media-server';

const campaignColumns = 'id,name,message_template,status,scheduled_for,recipient_count,queued_count,sent_count,failed_count,suppressed_count,created_at,started_at,completed_at,media_url,media_type,media_mime_type,media_file_name,vc_numbers(label)';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const target = workspaceId.parse(url.searchParams.get('workspaceId'));
    const campaignId = url.searchParams.get('campaignId');
    const { db } = await authorize(target);
    if (campaignId) {
      const id = workspaceId.parse(campaignId);
      const { data: campaign, error } = await db.from('vc_campaigns').select(campaignColumns).eq('workspace_id',target).eq('id',id).single();
      if (error || !campaign) throw new ApiError(404,'Campaign not found.');
      const { data: recipients, error: recipientsError } = await db.from('vc_campaign_recipients').select('id,phone,name,status,error_code,sent_at').eq('workspace_id',target).eq('campaign_id',id).order('created_at').limit(5000);
      if (recipientsError) throw new ApiError(500,'Campaign recipients could not be loaded.');
      return json({ campaign: { ...campaign, number_label: (campaign.vc_numbers as unknown as { label?: string }|null)?.label }, recipients: recipients ?? [] });
    }
    const { data, error } = await db.from('vc_campaigns').select(campaignColumns).eq('workspace_id',target).order('created_at',{ascending:false}).limit(50);
    if (error) throw new ApiError(500,'Campaigns could not be loaded. Apply migration 008 first.');
    return json({ campaigns: (data ?? []).map(row => ({ ...row, number_label: (row.vc_numbers as unknown as { label?: string }|null)?.label })) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const input = campaignAction.parse(await body(request,750000));
    const { db } = await authorize(input.workspaceId,true);
    if (input.action === 'create') {
      const media = input.media ? validateMediaUrl(input.media) : undefined;
      const request = media
        ? db.rpc('vc_create_media_campaign',{ target: input.workspaceId, source_number: input.numberId, campaign_name: input.name, campaign_message: input.text, send_at: input.scheduledFor, recipients: input.recipients, attachment_url: media.url, attachment_type: media.type, attachment_mime: media.mimeType, attachment_name: media.fileName })
        : db.rpc('vc_create_campaign',{ target: input.workspaceId, source_number: input.numberId, campaign_name: input.name, campaign_message: input.text, send_at: input.scheduledFor, recipients: input.recipients });
      const { data: id, error } = await request;
      if (error || !id) throw new ApiError(400,'Campaign could not be created.');
      return json({ id, status: input.scheduledFor && new Date(input.scheduledFor)>new Date() ? 'scheduled' : 'queued' },201);
    }
    const { error } = await db.rpc('vc_campaign_action',{ target: input.workspaceId, campaign: input.campaignId, next_action: input.action });
    if (error) throw new ApiError(400,error.message);
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
