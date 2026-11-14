import {request,type Session} from './api';
export type CalendarGrant={read:boolean;book:boolean;reschedule:boolean;cancel:boolean};
export type CalendarPolicy={timezone:string;windows:{day:number;start_minute:number;end_minute:number}[];blocked_dates:string[];durations:number[];step_minutes:number;buffer_before_minutes:number;buffer_after_minutes:number;minimum_notice_minutes:number;horizon_days:number;require_approval:boolean};
export type Calendar={id:string;organization_id:string;revision:number;name:string;provider:'native'|'google';enabled:boolean;writable:boolean;connection_id?:string;external_id?:string;policy:CalendarPolicy;agents:Record<string,CalendarGrant>};
export type Connection={id:string;label:string;mode:'read'|'write';status:string};
export type Slot={id:string;calendar_id:string;checked_calendar_ids:string[];start:string;end:string;timezone:string};
export type Booking={id:string;calendar_id:string;conversation_id:string;revision:number;status:string;event:{summary:string;start:string;end:string};updated_at:string;needs_review:boolean};
export type CalendarInput={kind:'availability'|'book'|'reschedule'|'cancel';calendar_ids?:string[];mode?:'any'|'all';from?:string;to?:string;duration_minutes?:number;availability_id?:string;slot_id?:string;booking_id?:string;expected_revision?:number;conversation_id?:string;summary?:string};
export type CalendarRequest={id:string;source:string;status:'queued'|'waiting_approval'|'running'|'completed'|'confirmed'|'cancelled'|'failed'|'uncertain';input:CalendarInput;result:{status:string;error?:string;slots?:Slot[];limited:boolean;event?:unknown};effect_started:boolean;created_at:string;expires_at:string};
export type CalendarCapabilities={enabled:boolean;google_configured:boolean;can_configure:boolean;can_request:boolean};
const base='/v1/sdr/calendar';
export const calendars={
 capabilities:(s:Session,signal?:AbortSignal)=>request<CalendarCapabilities>(base+'/capabilities',s,undefined,undefined,signal),
 list:(s:Session,signal?:AbortSignal)=>request<{items:Calendar[]}>(base+'/calendars',s,undefined,undefined,signal),
 connections:(s:Session,signal?:AbortSignal)=>request<{items:Connection[]}>(base+'/connections',s,undefined,undefined,signal),
 bookings:(s:Session,signal?:AbortSignal)=>request<{items:Booking[]}>(base+'/bookings',s,undefined,undefined,signal),
 requests:(s:Session,signal?:AbortSignal)=>request<{items:CalendarRequest[]}>(base+'/requests',s,undefined,undefined,signal),
 save:(s:Session,id:string|null,data:{name:string;enabled:boolean;policy:CalendarPolicy;agents:Record<string,CalendarGrant>;expected_revision:number},key:string)=>request<Calendar>(base+'/calendars'+(id?'/'+encodeURIComponent(id):''),s,data,key),
 request:(s:Session,input:CalendarInput,key:string)=>request<CalendarRequest>(base+'/requests',s,input,key),
 getRequest:(s:Session,id:string,signal?:AbortSignal)=>request<CalendarRequest>(base+'/requests/'+encodeURIComponent(id),s,undefined,undefined,signal),
 action:(s:Session,id:string,action:'approve'|'cancel'|'reconcile')=>request<CalendarRequest>(base+'/requests/'+encodeURIComponent(id)+'/actions',s,{action}),
 connectGoogle:(s:Session,label:string,mode:'read'|'write')=>request<{authorization_url:string;ticket:string;expires_in:number}>(base+'/google/authorize',s,{label,mode}),
 googleCalendars:(s:Session,id:string)=>request<{items:{id:string;summary:string;timeZone:string;accessRole:string}[]}>(base+'/google/'+encodeURIComponent(id)+'/calendars',s),
 attachGoogle:(s:Session,id:string,external_id:string,name:string,policy:CalendarPolicy)=>request<Calendar>(base+'/google/'+encodeURIComponent(id)+'/attach',s,{external_id,name,policy}),
 disconnectGoogle:(s:Session,id:string)=>request<{disconnected:boolean}>(base+'/google/'+encodeURIComponent(id)+'/disconnect',s,{}),
};
export function defaultCalendarPolicy():CalendarPolicy{return{timezone:'America/Cuiaba',windows:[1,2,3,4,5].map(day=>({day,start_minute:480,end_minute:1080})),blocked_dates:[],durations:[30,60],step_minutes:15,buffer_before_minutes:0,buffer_after_minutes:0,minimum_notice_minutes:30,horizon_days:60,require_approval:true}}
export function workflowCalendarAgent(workflowId:string){return 'workflow:'+workflowId}
