import {ApiError,request,type Session} from './api';
export type CustomerExport={id:string;status:'queued'|'running'|'ready'|'failed';createdAt:string;capturedAt:string|null;expiresAt:string;downloadPath:string|null;errorCode:string|null};
type QueryResult<T>={data:T|null;errors?:{message:string}[]};
export async function customerQuery<T>(session:Session,query:string,variables:Record<string,unknown>={},signal?:AbortSignal):Promise<T>{
 const result=await request<QueryResult<T>>('/v1/customer/graphql',session,{query,variables},undefined,signal);
 if(result.errors?.length||!result.data)throw new Error('customer_query_failed');
 return result.data;
}
export async function customerDownload(session:Session,id:string,signal:AbortSignal):Promise<Blob>{
 if(!/^exp_[a-f0-9]{48}$/.test(id))throw Error('invalid_export');
 const response=await fetch('https://sdk.arkom.ai/sdr-next/v1/customer/exports/'+id+'/content',{headers:{Authorization:`Bearer ${session.access_token}`},credentials:'omit',redirect:'error',signal});
 if(!response.ok){const body=await response.json();throw new ApiError(response.status,body.error,response.headers.get('Retry-After'))}
 return response.blob();
}
