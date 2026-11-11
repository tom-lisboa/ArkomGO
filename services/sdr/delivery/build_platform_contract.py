"""Build the public, credential-free OpenAPI contract shipped with the Lovable UI."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
schemas = {}
def ref(name): return {'$ref': '#/components/schemas/' + name}
def text(*values): return {'type': 'string', **({'enum': list(values)} if values else {})}
def integer(): return {'type': 'integer'}
def array(item): return {'type': 'array', 'items': item}
def obj(fields, required=(), strict=False):
    return {'type':'object','properties':fields,**({'required':list(required)} if required else {}),**({'additionalProperties':False} if strict else {})}
def strings(): return {'type':'object','additionalProperties':text()}
def define(name, fields, required=(), strict=False): schemas[name]=obj(fields, required, strict)
boolean={'type':'boolean'}
stamp={'type':'string','format':'date-time'}
roles=array(text('admin','operator'))
define('Error', {'error':text(),'issues':array(text())}, ['error'])
define('Identity', {'user_id':text(),'organization_id':text(),'role':text('admin','operator','viewer'),'environment':text()})
define('Login', {'company':text('alfa','beta'),'role':text('admin','operator','viewer'),'access_code':text()}, ['company','role','access_code'],True)
define('Session', {'access_token':text(),'identity':ref('Identity')}, ['access_token','identity'])
define('Binding', {'from':text('input','literal','step','memory','conversation'),'key':text(),'step_id':text(),'value':text()}, ['from'],True)
define('Condition', {'binding':ref('Binding'),'operator':text('equals','not_empty'),'value':text()}, ['binding','operator','value'],True)
define('InputField', {'name':text(),'label':text(),'required':boolean,'default':text(),'max_length':{'type':'integer','minimum':1,'maximum':2000}}, ['name','label','required','default','max_length'],True)
define('Tool', {'id':text(),'name':text(),'handler':text('business.lookup','offer.prepare','conversation.note','conversation.pause','media.send','calendar.availability','calendar.book','calendar.reschedule','calendar.cancel'),'enabled':boolean,'approval':text('always','automatic'),'approver_roles':roles}, ['id','name','handler','enabled','approval','approver_roles'],True)
define('Step', {'id':text(),'tool_id':text(),'inputs':{'type':'object','additionalProperties':ref('Binding')},'condition':ref('Condition')}, ['id','tool_id','inputs'],True)
define('MemoryCondition', {'field':text('name','company','segment','sellers','contact_volume','current_tool','goal'),'operator':text('exists','equals'),'value':text()}, ['field','operator','value'],True)
define('Automation', {'enabled':boolean,'once':boolean,'conditions':array(ref('MemoryCondition')),'inputs':{'type':'object','additionalProperties':ref('Binding')}}, ['enabled','once','conditions','inputs'],True)
define('Workflow', {'id':text(),'name':text(),'description':text(),'solution':text('sdr','atendimento','marketing'),'enabled':boolean,'roles':roles,'inputs':array(ref('InputField')),'steps':array(ref('Step')),'automation':ref('Automation')}, ['id','name','description','solution','enabled','roles','inputs','steps','automation'],True)
define('Configuration', {'tools':array(ref('Tool')),'workflows':array(ref('Workflow'))}, ['tools','workflows'],True)
define('ConfigVersion', {'version':integer(),'config':ref('Configuration'),'published_at':stamp,'published_by':text(),'reason':text(),'restored_from':integer()})
define('HistoryEntry', {'version':integer(),'published_at':stamp,'published_by':text(),'reason':text(),'restored_from':integer()})
define('Workspace', {'organization_id':text(),'revision':integer(),'draft':ref('Configuration'),'published':ref('ConfigVersion'),'history':array(ref('HistoryEntry')),'validation_issues':array(text()),'has_unpublished_changes':boolean,'updated_at':stamp})
define('ConfigCommand', {'config':ref('Configuration'),'expected_revision':integer(),'reason':text(),'version':integer()}, ['expected_revision','reason'],True)
define('ValidationCommand', {'config':ref('Configuration')}, (),True)
define('Validation', {'valid':boolean,'issues':array(text()),'effects_applied':boolean})
define('ConfigResult', {'workspace':ref('Workspace'),'duplicate':boolean})
define('Parameter', {'name':text(),'label':text(),'required':boolean,'max_length':integer()})
define('Handler', {'id':text(),'name':text(),'description':text(),'parameters':array(ref('Parameter')),'output_fields':array(text()),'writes':boolean})
define('Capabilities', {'api_version':text(),'configuration_version':integer(),'handlers':array(ref('Handler')),'binding_sources':array(text()),'memory_fields':array(text()),'execution_modes':array(text('preview','apply')),'states':array(text()),'can_configure':boolean,'can_execute':boolean,'max_steps':integer(),'max_workflows':integer(),'real_whatsapp_delivery':boolean,'media_automation':{'type':'object','properties':{'available':boolean,'whatsapp_enabled':boolean,'handler':text('media.send'),'upload_path':text(),'kinds':array(text()),'max_bytes':integer(),'max_schedule_days':integer(),'delivery_status_is_separate':boolean}}})
define('CreateExecution', {'workflow_id':text(),'mode':text('preview','apply'),'source':text('draft','published'),'input':strings(),'expected_configuration_revision':integer(),'expected_configuration_version':integer(),'not_before':stamp}, ['workflow_id','mode','source','input'],True)
define('StepResult', {'step_id':text(),'tool_id':text(),'status':text('completed','skipped'),'output':{'type':['object','null']},'preview':boolean,'completed_at':stamp,'approved_by':text()})
define('ApprovalRequest', {'step_id':text(),'tool_name':text(),'inputs':strings(),'preview_result':{'type':'object'}})
define('Execution', {'id':text(),'organization_id':text(),'sequence':integer(),'revision':integer(),'workflow_id':text(),'workflow_name':text(),'mode':text('preview','apply'),'source':text('draft','published'),'origin':text('manual','automation'),'actor_id':text(),'not_before':stamp,'status':text('queued','running','waiting_approval','paused','completed','failed','cancelled'),'configuration_version':integer(),'configuration_revision':integer(),'business_version':integer(),'input':strings(),'steps':array(ref('StepResult')),'next_step':integer(),'steps_count':integer(),'error_code':text(),'approval_request':{'anyOf':[ref('ApprovalRequest'),{'type':'null'}]},'allowed_actions':array(text('approve','cancel','pause','resume','retry')),'created_at':stamp,'updated_at':stamp})
define('ExecutionResult', {'execution':ref('Execution'),'duplicate':boolean})
define('ExecutionList', {'items':array(ref('Execution')),'has_more':boolean,'next_before_seq':integer()})
define('ActionCommand', {'kind':text('approve','cancel','pause','resume','retry'),'expected_revision':integer(),'reason':text()}, ['kind','expected_revision','reason'],True)
define('Event', {'sequence':integer(),'kind':text(),'status':text(),'step_id':text(),'actor_id':text(),'detail':text(),'at':stamp})
define('Events', {'items':array(ref('Event')),'next_after_seq':integer(),'status':text()})
define('Export', {'execution':ref('Execution'),'configuration':ref('Configuration'),'business_context':{'type':'object'},'events':array(ref('Event')),'exported_at':stamp})
define('Note', {'id':text(),'organization_id':text(),'conversation_id':text(),'text':text(),'actor_id':text(),'execution_id':text(),'at':stamp})
define('Notes', {'items':array(ref('Note'))})
define('Messaging', {'enabled':boolean,'revision':integer(),'test_phones':array(text()),'synced':boolean,'last_sync':stamp,'error_code':text(),'text_only':boolean,'media_enabled':boolean,'media_available':boolean,'max_media_bytes':integer(),'max_test_contacts':integer()})
define('MessagingCommand', {'enabled':boolean,'media_enabled':boolean,'test_phones':{'type':'array','items':text(),'maxItems':3},'expected_revision':integer(),'reason':text()}, ['enabled','test_phones','expected_revision','reason'],True)
define('MessagingResult', {'messaging':ref('Messaging'),'duplicate':boolean})
paths={}
def operation(path,method,ident,summary,response,body=None,status=200,description='',idem=False,public=False,params=()):
    errors={str(code):{'description':label,'content':{'application/json':{'schema':ref('Error')}}} for code,label in [(401,'Sessão inválida ou expirada'),(403,'Perfil/ação não autorizado'),(404,'Recurso indisponível para a empresa'),(409,'Conflito de revisão, dependência ou limite'),(422,'Entrada inválida'),(429,'Limite de requisições'),(503,'Armazenamento indisponível')]}
    out={'operationId':ident,'summary':summary,'description':description,'responses':{str(status):{'description':'Sucesso','content':{'application/json':{'schema':ref(response)}}},**errors}}
    parameters=list(params)
    if '{id}' in path:parameters.append({'name':'id','in':'path','required':True,'schema':text()})
    if idem:parameters.append({'name':'Idempotency-Key','in':'header','required':True,'schema':{'type':'string','minLength':1,'maxLength':100},'description':'Preserve chave e corpo ao confirmar a mesma operação.'})
    if parameters:out['parameters']=parameters
    if body:out['requestBody']={'required':True,'content':{'application/json':{'schema':ref(body)}}}
    if public:out['security']=[]
    paths.setdefault(path,{})[method.lower()]=out
def query(name, minimum,maximum=None):return {'name':name,'in':'query','schema':{'type':'integer','minimum':minimum,**({'maximum':maximum} if maximum else {})}}
operation('/__test/ui/login','POST','pilotLogin','Entrar no piloto de duas empresas','Session','Login',public=True,description='Códigos entregues separadamente. Sessão opaca de uma hora, em memória no navegador. Não é provisionamento comercial.')
operation('/v1/platform/capabilities','GET','platformCapabilities','Catálogo e capacidades do perfil','Capabilities')
operation('/v1/platform/configuration','GET','platformConfiguration','Rascunho, versão publicada e histórico da empresa','Workspace')
operation('/v1/platform/configuration/validate','POST','validateConfiguration','Conferir configuração sem efeitos','Validation','ValidationCommand',description='Somente administrador; sem config usa o rascunho salvo.')
for action,desc in [('draft','Exige config; permite rascunho incompleto dentro dos limites e retorna validation_issues.'),('publish','Sem config/version; publica o rascunho válido e cancela pedidos pendentes afetados.'),('restore','Exige version; recupera como nova publicação e rascunho. Sem config.')]:
    operation('/v1/platform/configuration/'+action,'POST',action+'Configuration','Administrador: '+action,'ConfigResult','ConfigCommand',description=desc+' Exige expected_revision atual e motivo.',idem=True)
operation('/v1/platform/executions','POST','createExecution','Solicitar processamento pelo worker Go','ExecutionResult','CreateExecution',status=202,idem=True,description='Viewer não executa. Draft só admite preview do admin com expected_configuration_revision. Published admite preview/apply; envie expected_configuration_version. Input somente campos declarados; empresa vem da sessão. not_before opcional RFC3339 futuro até sete dias, somente apply. O agendamento persiste no Go e pode ser pausado/cancelado pelas actions. media.send exige conversa ativa e respeita mudanças de entrada, pausa, opt-out e configuração; completed da etapa significa enfileirado, não entregue.')
operation('/v1/platform/executions','GET','listExecutions','Pedidos da própria empresa, mais recentes primeiro','ExecutionList',params=[query('limit',1,100),query('before_seq',1)])
operation('/v1/platform/executions/{id}','GET','getExecution','Consultar execução e ações disponíveis','Execution')
operation('/v1/platform/executions/{id}/events','GET','executionEvents','Acompanhar etapas por sequência','Events',params=[query('after_seq',0)])
operation('/v1/platform/executions/{id}/actions','POST','executionAction','Aprovar, cancelar, pausar, retomar ou repetir falha transitória','ExecutionResult','ActionCommand',idem=True,description='Use somente allowed_actions retornadas pela API e a revisão atual. Aprovação vale apenas para a etapa atual por 15 minutos. Pausar/cancelar não desfaz etapas concluídas.')
operation('/v1/platform/executions/{id}/export','GET','exportExecution','Exportar execução, snapshots e eventos da empresa','Export')
operation('/v1/platform/conversations/{id}/notes','GET','conversationNotes','Consultar notas internas da conversa da empresa','Notes')
operation('/v1/sdr/whatsapp/messaging','GET','getWhatsAppMessaging','Consultar ativação e contatos de teste autorizados','Messaging')
operation('/v1/sdr/whatsapp/messaging','POST','configureWhatsAppMessaging','Administrador: ativar atendimento e permitir mídias','MessagingResult','MessagingCommand',idem=True,description='Até três números autorizados com DDI e DDD. Ativação exige WhatsApp conectado. Uma nova revisão encerra trabalhos pendentes da sessão anterior; mensagens já em envio podem concluir. Não processa grupos ou histórico anterior. media_enabled permite áudios, imagens e PDF recebidos e anexos enviados pela equipe, até 8 MB; áudios até 3 minutos.')
define('MediaFile',{'kind':text('audio','image','document','video'),'mime':text(),'name':text(),'size':integer(),'sha256':text(),'seconds':integer()})
define('MediaAsset',{'id':text(),'organization_id':text(),'conversation_id':text(),'direction':text('inbound','outbound'),'file':ref('MediaFile'),'status':text('pending','processing','ready','failed'),'error':text(),'created_at':stamp,'expires_at':stamp})
define('MediaUploadResult',{'asset':ref('MediaAsset'),'duplicate':boolean})
define('MessageMedia',{'id':text(),'kind':text(),'mime':text(),'name':text(),'size':integer(),'status':text()})
define('SDRMessage',{'id':text(),'text':text(),'author':text(),'status':text(),'media':ref('MessageMedia'),'created_at':stamp,'execution_id':text(),'execution_step':text()})
define('MediaMessageCommand',{'text':text(),'media_id':text(),'expected_revision':integer()},['expected_revision'],True)
define('MediaMessageResult',{'operation_id':text(),'duplicate':boolean,'message':ref('SDRMessage')})
operation('/v1/sdr/conversations/{id}/media','POST','uploadConversationMedia','Equipe: anexar arquivo para preparar envio','MediaUploadResult',status=202,idem=True,description='Administrador/operador com conversa assumida ou pausada. Arquivo vinculado à empresa e conversa. Preservar o mesmo arquivo e a mesma Idempotency-Key em uma confirmação incerta. Não envia automaticamente. Máximo 8 MB; formatos PNG/JPEG/WebP/GIF, áudio, PDF e MP4 H264/AAC. Áudio até 180 segundos é convertido para nota de voz Ogg/Opus.')
paths['/v1/sdr/conversations/{id}/media']['post']['requestBody']={'required':True,'content':{'multipart/form-data':{'schema':obj({'file':{'type':'string','format':'binary'}},['file'],True)}}}
operation('/v1/sdr/media/{id}','GET','getConversationMedia','Consultar preparação do anexo da empresa','MediaAsset')
operation('/v1/sdr/media/{id}/content','GET','downloadConversationMedia','Baixar anexo autenticado da empresa','MediaAsset',description='Retorna bytes com Content-Disposition attachment e Cache-Control no-store. Nunca retorna URL de provedor. Acesso expira em sete dias; estado expirado retorna HTTP 410.')
paths['/v1/sdr/media/{id}/content']['get']['responses']['200']['content']={'application/octet-stream':{'schema':{'type':'string','format':'binary'}}}
paths['/v1/sdr/media/{id}/content']['get']['responses']['410']={'description':'Prazo de acesso ao anexo expirado'}
operation('/v1/sdr/conversations/{id}/messages','POST','sendConversationMessage','Equipe: enviar mensagem e anexo preparado','MediaMessageResult','MediaMessageCommand',status=202,idem=True,description='Conversa assumida/pausada, expected_revision atual. Texto ou media_id é obrigatório. media_id precisa pertencer à conversa e estar ready. Áudio é enviado sem legenda; demais anexos aceitam legenda até 1.000 caracteres. O envio passa pelas mesmas verificações de pausa, opt-out, sessão e resultado incerto do texto. Não reenviar automaticamente um envio sem confirmação.')
define('CancelMediaCommand',{'expected_revision':integer(),'reason':text()},['expected_revision','reason'],True)
define('CancelMediaResult',{'message':ref('SDRMessage'),'duplicate':boolean})
operation('/v1/sdr/media','POST','prepareCompanyMedia','Preparar arquivo reutilizável da empresa para fluxos do cliente','MediaUploadResult',status=202,idem=True,description='Administrador/operador; multipart file, mesmos formatos e limites do anexo. conversation_id fica vazio e o arquivo pode ser reutilizado nas conversas da mesma empresa. Preparar nunca envia. Aguarde status ready antes de executar media.send. Prazo de sete dias; não aceita URL de terceiros. Não exige assumir conversa.')
paths['/v1/sdr/media']['post']['requestBody']=paths['/v1/sdr/conversations/{id}/media']['post']['requestBody']
operation('/v1/sdr/conversations/{id}/messages/{message_id}','GET','getMessageDelivery','Consultar status efetivo do envio da própria empresa','SDRMessage',description='queued/sending/sent/uncertain/cancelled. sent confirma entrega ao provedor, não leitura no telefone. uncertain não deve ser repetido automaticamente.',params=[{'name':'message_id','in':'path','required':True,'schema':text()}])
operation('/v1/sdr/conversations/{id}/messages/{message_id}/cancel','POST','cancelPendingMediaSend','Cancelar mídia antes da autorização final de envio','CancelMediaResult','CancelMediaCommand',idem=True,description='Administrador/operador, expected_revision da conversa e motivo. Envio que já começou retorna 409 send_already_started; não é possível recolher uma mensagem enviada.',params=[{'name':'message_id','in':'path','required':True,'schema':text()}])
# Customer data stays on the private Go platform; these are public client contracts only.
define('CustomerGraphQLRequest', {'query':text(),'operationName':text(),'variables':{'type':'object'}}, ['query'],True)
define('CustomerGraphQLResponse', {'data':{'type':['object','null']},'errors':array(obj({'message':text()}))})
define('CustomerExportRequest', {}, (),True)
define('CustomerExport', {'id':text(),'status':text('queued','running','ready','failed'),'createdAt':stamp,'capturedAt':{'type':['string','null'],'format':'date-time'},'expiresAt':stamp,'downloadPath':{'type':['string','null']},'errorCode':{'type':['string','null']}}, ['id','status','createdAt','expiresAt'])
operation('/v1/customer/graphql','POST','queryOwnCustomerData','GraphQL dos dados e métricas da própria empresa','CustomerGraphQLResponse','CustomerGraphQLRequest',description='Somente administrador. Empresa vem da sessão; não aceita escolher organization_id. Schema: customer-schema.graphql. Consulta com paginação, coleção, conversa e datas. Mutations não estão habilitadas. Requer ativação na instalação nova; 404 enquanto desativado.')
operation('/v1/customer/exports','POST','prepareCustomerExport','Preparar ZIP privado dos registros conservados da empresa','CustomerExport','CustomerExportRequest',status=202,idem=True,description='Somente administrador. Worker em segundo plano; não envia WhatsApp nem chama IA. Arquivo e estado separados por empresa; validade de 24h. Manifesto identifica cobertura, métricas indisponíveis e anexos expirados. Não exporta credenciais nem histórico anterior do celular.')
operation('/v1/customer/exports/{id}','GET','getCustomerExport','Consultar a preparação do ZIP da empresa','CustomerExport')
operation('/v1/customer/exports/{id}/content','GET','downloadCustomerExport','Baixar ZIP com sessão atual de administrador','CustomerExport')
paths['/v1/customer/exports/{id}/content']['get']['responses']['200']['content']={'application/zip':{'schema':{'type':'string','format':'binary'}}}
for path in ['/v1/customer/exports/{id}','/v1/customer/exports/{id}/content']:
    paths[path]['get']['responses']['410']={'description':'Prazo do arquivo expirado'}
# Agenda and Google connection remain in our backend; the browser receives no provider credential.
define('CalendarPolicy', {'timezone':text(),'windows':array(obj({'day':integer(),'start_minute':integer(),'end_minute':integer()},['day','start_minute','end_minute'],True)),'blocked_dates':array(text()),'durations':array(integer()),'step_minutes':integer(),'buffer_before_minutes':integer(),'buffer_after_minutes':integer(),'minimum_notice_minutes':integer(),'horizon_days':integer(),'require_approval':boolean})
define('CalendarGrant', {'read':boolean,'book':boolean,'reschedule':boolean,'cancel':boolean})
define('CalendarConfig', {'name':text(),'enabled':boolean,'policy':ref('CalendarPolicy'),'agents':{'type':'object','additionalProperties':ref('CalendarGrant')},'expected_revision':integer()},['name','enabled','policy','agents'],True)
define('ManagedCalendar', {'id':text(),'organization_id':text(),'name':text(),'provider':text('native','google'),'revision':integer(),'enabled':boolean,'writable':boolean,'connection_id':text(),'external_id':text(),'policy':ref('CalendarPolicy'),'agents':{'type':'object','additionalProperties':ref('CalendarGrant')}})
define('CalendarCapabilities', {'enabled':boolean,'google_configured':boolean,'can_configure':boolean,'can_request':boolean,'max_calendars':integer(),'max_connections':integer(),'actions':array(text()),'multi_calendar_modes':array(text('any','all'))})
define('CalendarItems', {'items':array(ref('ManagedCalendar'))})
define('CalendarRecords', {'items':array({'type':'object'})})
define('CalendarInput', {'kind':text('availability','book','reschedule','cancel'),'calendar_ids':array(text()),'mode':text('any','all'),'from':stamp,'to':stamp,'duration_minutes':integer(),'availability_id':text(),'slot_id':text(),'booking_id':text(),'expected_revision':integer(),'conversation_id':text(),'summary':text()},['kind'],True)
define('CalendarRequest', {'id':text(),'organization_id':text(),'source':text(),'status':text('queued','waiting_approval','running','completed','confirmed','cancelled','failed','uncertain'),'input':ref('CalendarInput'),'result':{'type':'object'},'created_at':stamp,'expires_at':stamp,'effect_started':boolean,'approved_by':text()})
define('CalendarAction', {'action':text('approve','cancel','reconcile')},['action'],True)
define('GoogleCalendarAuthorize', {'label':text(),'mode':text('read','write')},['label','mode'],True)
define('GoogleCalendarAuthorizeResult', {'authorization_url':text(),'ticket':text(),'expires_in':integer()})
define('GoogleCalendarAttach', {'external_id':text(),'name':text(),'policy':ref('CalendarPolicy')},['external_id','name','policy'],True)
define('GoogleCalendarDisconnected', {'disconnected':boolean})
operation('/v1/sdr/calendar/capabilities','GET','calendarCapabilities','Consultar disponibilidade da agenda e da configuração Google','CalendarCapabilities',description='404 enquanto a etapa não está ativada. Não implica autorização Google concluída.')
operation('/v1/sdr/calendar/calendars','GET','listCalendars','Agendas da empresa autenticada','CalendarItems')
operation('/v1/sdr/calendar/calendars','POST','createCalendar','Administrador cria uma agenda própria','ManagedCalendar','CalendarConfig',idem=True)
operation('/v1/sdr/calendar/calendars/{id}','POST','configureCalendar','Administrador salva regras e permissões com revisão esperada','ManagedCalendar','CalendarConfig',idem=True)
operation('/v1/sdr/calendar/connections','GET','calendarConnections','Conexões públicas da empresa, sem tokens','CalendarRecords')
operation('/v1/sdr/calendar/bookings','GET','calendarBookings','Reservas gerenciadas pela plataforma','CalendarRecords',description='Inclui updated_at da última confirmação. Não é sincronização contínua de todos os eventos Google.')
operation('/v1/sdr/calendar/requests','GET','calendarRequests','Últimos cem pedidos da empresa','CalendarRecords')
operation('/v1/sdr/calendar/requests','POST','requestCalendar','Solicitar disponibilidade ou mudança de reserva','CalendarRequest','CalendarInput',status=202,idem=True,description='Empresa e identidade derivadas da sessão. queued/waiting_approval não confirmam reserva. Uma consulta any/all pode comparar várias agendas; a reserva cria evento somente na agenda indicada na opção. Consulte request_id antes de apresentar sucesso.')
operation('/v1/sdr/calendar/requests/{id}','GET','getCalendarRequest','Consultar resultado efetivo de um pedido','CalendarRequest')
operation('/v1/sdr/calendar/requests/{id}/actions','POST','calendarRequestAction','Aprovar, cancelar pedido ou conferir resultado incerto','CalendarRequest','CalendarAction',description='Aprovação e conciliação exigem administrador. Cancelar pedido ainda não autorizado não equivale a cancelar uma reserva já criada.')
operation('/v1/sdr/calendar/google/authorize','POST','authorizeGoogleCalendar','Administrador inicia login Google por janela normal','GoogleCalendarAuthorizeResult','GoogleCalendarAuthorize',description='Retorna URL e ticket efêmero separados. A interface inicia a janela por formulário POST com ticket e a sessão atual no corpo, sem credenciais na URL. Não pedir ou incluir client_secret na interface. Configuração OAuth da plataforma é requisito pendente.')
operation('/v1/sdr/calendar/google/{id}/calendars','GET','listGoogleCalendars','Listar agendas acessíveis na conexão da própria empresa','CalendarRecords')
operation('/v1/sdr/calendar/google/{id}/attach','POST','attachGoogleCalendar','Associar agenda selecionada e regras da plataforma','ManagedCalendar','GoogleCalendarAttach')
operation('/v1/sdr/calendar/google/{id}/disconnect','POST','disconnectGoogleCalendar','Interromper novos usos e apagar credenciais locais','GoogleCalendarDisconnected',description='Administrador. Não apaga eventos já criados e não equivale à revogação global do consentimento no Google.')

voice_profile={'name':text(),'greeting':text(),'instructions':text(),'model':text('gpt-realtime','gpt-realtime-mini'),
               'voice':text('marin','cedar','alloy','coral','sage','verse'),'max_seconds':{'type':'integer','minimum':30,'maximum':300}}
define('VoiceProfile',voice_profile,voice_profile,True)
voice_config={'account_sid':text(),'sender_sid':text(),'template_sid':text(),'test_phone':text(),'profile':ref('VoiceProfile')}
define('VoiceConfig', {**voice_config,'expected_revision':integer(),'twilio_auth_token':{**text(),'format':'password','writeOnly':True},
                      'openai_api_key':{**text(),'format':'password','writeOnly':True}},
       ['account_sid','sender_sid','template_sid','profile','expected_revision'],True)
define('VoiceStatus', {**voice_config,'available':boolean,'configured':boolean,'enabled':boolean,'can_configure':boolean,
                      'revision':integer(),'sender':text(),'messaging_webhook':text(),'voice_webhook':text()},['available'])
define('VoiceRevision', {'expected_revision':integer()},['expected_revision'],True)
define('VoiceCall', {'id':text(),'conversation_id':text(),'status':text(),'error_code':text(),'created_at':stamp,'expires_at':stamp},['id','status','created_at','expires_at'])
define('VoiceCalls', {'items':array(ref('VoiceCall'))},['items'])
schemas['VoiceCallInput']={'oneOf':[obj({'test':{'const':True}},['test'],True),obj({'conversation_id':text()},['conversation_id'],True)]}
operation('/v1/sdr/voice','GET','getVoiceStatus','Consultar IA de voz da empresa','VoiceStatus',description='Retorna as URLs de configuração ao administrador. Os segredos nunca são retornados.')
operation('/v1/sdr/voice/config','POST','saveVoiceConfig','Salvar credenciais e perfil de voz da empresa','VoiceStatus','VoiceConfig',description='Somente administrador. Os segredos são obrigatórios no primeiro cadastro. Alterações exigem nova validação antes de ligar.')
operation('/v1/sdr/voice/activate','POST','activateVoice','Validar provedores e habilitar ligações','VoiceStatus','VoiceRevision')
operation('/v1/sdr/voice/disable','POST','disableVoice','Desativar ligações da empresa','VoiceStatus','VoiceRevision')
operation('/v1/sdr/voice/calls','POST','requestVoiceCall','Pedir autorização nativa para ligação','VoiceCall','VoiceCallInput',status=202,idem=True,description='Administrador/operador em conversa autorizada. Apenas administrador pode usar o número próprio de teste. 202 enfileira a solicitação de permissão.')
operation('/v1/sdr/voice/calls','GET','listVoiceCalls','Listar as últimas ligações da empresa','VoiceCalls')
operation('/v1/sdr/voice/calls/{id}','GET','getVoiceCall','Consultar estado de uma ligação da empresa','VoiceCall')
document={'openapi':'3.1.0','info':{'title':'SDR Next · interface Lovable e execuções Go','version':'0.13.0','description':'Contrato da etapa 0.13 do piloto isolado. Agenda é uma etapa candidata, desativada por padrão; Google depende de configuração própria ainda pendente. Dados por cliente e exportação exigem ativação explícita no backend novo. Credenciais de provedores e contratos privados de workers não fazem parte desta API. Preview mantém histórico sem aplicar notas/pausas; apply usa ferramentas autorizadas e versões congeladas. Consulte delivery/platform-contract.md para limites e semântica de bindings.'},'servers':[{'url':'https://24.199.100.186/sdr-next'}],'security':[{'session':[]}],'paths':paths,'components':{'securitySchemes':{'session':{'type':'http','scheme':'bearer','description':'Token opaco do usuário, emitido pelo login do backend; não é chave de serviço.'}},'schemas':schemas}}
raw=json.dumps(document,ensure_ascii=False,indent=2)+'\n'
(root/'platform-openapi.json').write_text(raw)
(root/'delivery/lovable-template/platform-openapi.json').write_text(raw)
print('OpenAPI generated:',len(paths),'paths;',len(schemas),'schemas; no private worker contracts')
