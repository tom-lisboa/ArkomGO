import {ApiError,type Session} from './api';
const base='https://sdk.arkom.ai/sdr-next';
export type MediaFile={kind:'audio'|'image'|'document'|'video';mime:string;name:string;size:number;sha256:string};
export type MediaAsset={id:string;organization_id:string;conversation_id:string;direction:string;file:MediaFile;status:string;error?:string;expires_at:string};
export type MessageMedia={id:string;kind:string;mime:string;name:string;size:number;status:string};
async function checked(response:Response){if(!response.ok){const v=await response.json();throw new ApiError(response.status,v.error,response.headers.get('Retry-After'))}return response}
export async function uploadMedia(session:Session,conversation:string,file:File,key:string):Promise<MediaAsset>{
 return uploadTo(session,`/v1/sdr/conversations/${encodeURIComponent(conversation)}/media`,file,key);
}
// Reusable file for client-created workflows; preparing it never sends it.
export async function uploadCompanyMedia(session:Session,file:File,key:string):Promise<MediaAsset>{
 return uploadTo(session,'/v1/sdr/media',file,key);
}
async function uploadTo(session:Session,path:string,file:File,key:string):Promise<MediaAsset>{
 const data=new FormData();data.append('file',file);
 const response=await checked(await fetch(`${base}${path}`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Idempotency-Key':key},body:data,credentials:'omit',redirect:'error',signal:AbortSignal.timeout(35000)}));
 return (await response.json()).asset;
}
export async function mediaBlob(session:Session,id:string):Promise<Blob>{
 const response=await checked(await fetch(`${base}/v1/sdr/media/${encodeURIComponent(id)}/content`,{headers:{Authorization:`Bearer ${session.access_token}`},credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)}));return response.blob();
}
