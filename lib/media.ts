'use client';
import { supabaseBrowser } from '@/lib/supabase/client';

export type MediaAttachment={url:string;type:'image'|'video'|'audio'|'document';mimeType:string;fileName:string};
export const mediaAccept='image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,application/pdf,text/plain,text/csv,.doc,.docx,.xls,.xlsx';
const allowed=new Set(mediaAccept.split(',').filter(value=>!value.startsWith('.')));
export const maxMediaBytes=16*1024*1024;

export function mediaType(file:File):MediaAttachment['type'] {
  if(file.type.startsWith('image/'))return 'image';
  if(file.type.startsWith('video/'))return 'video';
  if(file.type.startsWith('audio/'))return 'audio';
  return 'document';
}

export function validateMedia(file:File) {
  if(!file.size)throw new Error('Choose a file to attach.');
  if(file.size>maxMediaBytes)throw new Error('Attachments must be 16 MB or smaller.');
  if(!allowed.has(file.type))throw new Error('Choose an image, MP4 video, audio file, PDF, Word, Excel, CSV, or text file.');
}

export async function uploadMedia(workspaceId:string,file:File):Promise<MediaAttachment> {
  validateMedia(file);
  const safeName=file.name.normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(-120)||'attachment';
  const path=`${workspaceId}/${crypto.randomUUID()}-${safeName}`;
  const storage=supabaseBrowser().storage.from('vc-media');
  const {error}=await storage.upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
  if(error)throw new Error('The attachment could not be uploaded. Please try again.');
  const {data,error:signError}=await storage.createSignedUrl(path,60*60*24*100);
  if(signError||!data?.signedUrl){await storage.remove([path]);throw new Error('The attachment could not be prepared. Please try again.');}
  return {url:data.signedUrl,type:mediaType(file),mimeType:file.type,fileName:safeName};
}
