import {request,type Session} from './api';
import {platform,type Tool,type Workflow} from './platform-api';
import {uploadCompanyMedia,type MediaAsset,type MessageMedia} from './media-api';

export type MediaDelivery={id:string;conversation_id:string;status:'queued'|'sending'|'sent'|'uncertain'|'cancelled';text:string;media?:MessageMedia;execution_id?:string;execution_step?:string};

// This module adds capabilities, not a screen. A Lovable remix chooses its own
// buttons, events and rules; authorization and dispatch remain in our Go API.
export const mediaFlows={
 upload:uploadCompanyMedia,
 asset:(s:Session,id:string)=>request<MediaAsset>('/v1/sdr/media/'+encodeURIComponent(id),s),
 create:(s:Session,options:{workflowId:string;conversationId:string;mediaId:string;caption?:string;configurationVersion:number;notBefore?:string;preview?:boolean},key:string)=>platform.create(s,{
  workflow_id:options.workflowId,mode:options.preview?'preview':'apply',source:'published',expected_configuration_version:options.configurationVersion,
  input:{conversation_id:options.conversationId,media_id:options.mediaId,caption:options.caption??''},
  ...(options.notBefore?{not_before:options.notBefore}:{}),
 },key),
 delivery:(s:Session,conversationId:string,messageId:string)=>request<MediaDelivery>(`/v1/sdr/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,s),
 cancelDelivery:(s:Session,conversationId:string,messageId:string,revision:number,reason:string,key:string)=>request<{message:MediaDelivery;duplicate:boolean}>(`/v1/sdr/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/cancel`,s,{expected_revision:revision,reason},key),
};

// Merge into the company's existing draft and use the standard validate/save/
// publish APIs. Calling this factory does not change configuration or send.
export function mediaWorkflowTemplate(id:string,toolId:string,name:string,approval:'always'|'automatic'='always'):{tool:Tool;workflow:Workflow}{
 return {
  tool:{id:toolId,name,handler:'media.send',enabled:true,approval,approver_roles:['admin']},
  workflow:{id,name,description:'Envio de mídia criado pelo cliente no Lovable',solution:'sdr',enabled:true,roles:['admin','operator'],
   inputs:[{name:'conversation_id',label:'Conversa',required:true,default:'',max_length:100},{name:'media_id',label:'Arquivo preparado',required:true,default:'',max_length:100},{name:'caption',label:'Legenda',required:false,default:'',max_length:1000}],
   steps:[{id:'envio',tool_id:toolId,inputs:{conversation_id:{from:'input',key:'conversation_id'},media_id:{from:'input',key:'media_id'},caption:{from:'input',key:'caption'}}}],
   automation:{enabled:false,once:true,conditions:[],inputs:{}},
  },
 };
}
