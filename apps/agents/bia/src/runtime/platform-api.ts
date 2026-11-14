import {request,type Session} from './api';
export type Binding={from:'input'|'literal'|'step'|'memory'|'conversation';key?:string;step_id?:string;value?:string};
export type Tool={id:string;name:string;handler:string;enabled:boolean;approval:'always'|'automatic';approver_roles:string[]};
export type Field={name:string;label:string;required:boolean;default:string;max_length:number};
export type Step={id:string;tool_id:string;inputs:Record<string,Binding>;condition?:{binding:Binding;operator:'equals'|'not_empty';value:string}};
export type Trigger={enabled:boolean;once:boolean;conditions:{field:string;operator:'exists'|'equals';value:string}[];inputs:Record<string,Binding>};
export type Workflow={id:string;name:string;description:string;solution:'sdr'|'atendimento'|'marketing';enabled:boolean;roles:string[];inputs:Field[];steps:Step[];automation:Trigger};
export type Configuration={tools:Tool[];workflows:Workflow[]};
export type ConfigVersion={version:number;config:Configuration;published_at:string;published_by:string;reason:string;restored_from?:number};
export type Workspace={organization_id:string;revision:number;draft:Configuration;published:ConfigVersion;history:Omit<ConfigVersion,'config'>[];has_unpublished_changes:boolean;validation_issues:string[]};
export type Handler={id:string;name:string;description:string;parameters:{name:string;label:string;required:boolean;max_length:number}[];output_fields:string[];writes:boolean};
export type Capabilities={api_version:string;handlers:Handler[];memory_fields:string[];can_configure:boolean;can_execute:boolean;execution_modes:string[];states:string[];max_steps:number;max_workflows:number;media_automation:{available:boolean;whatsapp_enabled:boolean;handler:"media.send";upload_path:string;kinds:string[];max_bytes:number;max_schedule_days:number;delivery_status_is_separate:boolean}};
export type Execution={id:string;organization_id:string;sequence:number;revision:number;workflow_id:string;workflow_name:string;mode:'preview'|'apply';source:'draft'|'published';origin:'manual'|'automation';status:string;configuration_version:number;configuration_revision:number;business_version:number;input:Record<string,string>;steps:{step_id:string;tool_id:string;status:string;output:Record<string,unknown>|null;preview:boolean;approved_by?:string;completed_at:string}[];next_step:number;steps_count:number;error_code:string;approval_request:{step_id:string;tool_name:string;inputs:Record<string,string>;preview_result:Record<string,unknown>}|null;allowed_actions:string[];created_at:string;updated_at:string;not_before?:string};
export type ExecutionEvent={sequence:number;kind:string;status:string;step_id?:string;actor_id:string;detail:string;at:string};
export type CreateExecution={workflow_id:string;mode:'preview'|'apply';source:'draft'|'published';input:Record<string,string>;expected_configuration_revision?:number;expected_configuration_version?:number;not_before?:string};
// Lovable can redesign every screen while keeping this client and its server-side authorization.
export const platform={
 capabilities:(s:Session,signal?:AbortSignal)=>request<Capabilities>('/v1/platform/capabilities',s,undefined,undefined,signal),
 configuration:(s:Session,signal?:AbortSignal)=>request<Workspace>('/v1/platform/configuration',s,undefined,undefined,signal),
 validate:(s:Session,config:Configuration)=>request<{valid:boolean;issues:string[]}>('/v1/platform/configuration/validate',s,{config}),
 configure:(s:Session,action:'draft'|'publish'|'restore',body:unknown,key:string)=>request<{workspace:Workspace;duplicate:boolean}>('/v1/platform/configuration/'+action,s,body,key),
 create:(s:Session,body:CreateExecution,key:string)=>request<{execution:Execution;duplicate:boolean}>('/v1/platform/executions',s,body,key),
 list:(s:Session,before?:number)=>request<{items:Execution[];has_more:boolean;next_before_seq:number}>('/v1/platform/executions?limit=30'+(before?'&before_seq='+before:''),s),
 get:(s:Session,id:string)=>request<Execution>('/v1/platform/executions/'+encodeURIComponent(id),s),
 events:(s:Session,id:string,after=0)=>request<{items:ExecutionEvent[];next_after_seq:number;status:string}>('/v1/platform/executions/'+encodeURIComponent(id)+'/events?after_seq='+after,s),
 act:(s:Session,id:string,body:{kind:string;expected_revision:number;reason:string},key:string)=>request<{execution:Execution;duplicate:boolean}>('/v1/platform/executions/'+encodeURIComponent(id)+'/actions',s,body,key),
 export:(s:Session,id:string)=>request<Record<string,unknown>>('/v1/platform/executions/'+encodeURIComponent(id)+'/export',s),
};
