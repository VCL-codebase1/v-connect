import 'server-only';
import { ApiError } from '@/lib/api';

export type ValidatedMedia={url:string;type:'image'|'video'|'audio'|'document';mimeType:string;fileName:string};
export function validateMediaUrl(media:ValidatedMedia|undefined) {
  if(!media)return;
  const base=process.env.NEXT_PUBLIC_SUPABASE_URL;
  if(!base)throw new ApiError(503,'Media uploads are not configured.');
  let url:URL;
  try{url=new URL(media.url);}catch{throw new ApiError(400,'Invalid attachment.');}
  if(url.origin!==new URL(base).origin||!url.pathname.startsWith('/storage/v1/object/sign/vc-media/')||!url.searchParams.get('token'))throw new ApiError(400,'Invalid attachment.');
  return media;
}

export function evolutionMediaBody(number:string,text:string,media:ValidatedMedia) {
  return {number,mediatype:media.type,mimetype:media.mimeType,caption:text,media:media.url,fileName:media.fileName};
}
