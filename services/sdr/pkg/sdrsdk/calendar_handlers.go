package sdrsdk

func calendarHandlers() []HandlerSpec {
	conversation := ParameterSpec{"conversation_id", "Conversa", true, 100}
	outputs := []string{"summary", "request_id", "status", "confirmed"}
	return []HandlerSpec{
		{ID: "calendar.availability", Name: "Consultar horários", Description: "Solicita horários reais em uma ou várias agendas autorizadas. Acompanhe request_id; etapa concluída significa pedido enfileirado.", Parameters: []ParameterSpec{conversation, {"calendar_ids", "Agendas separadas por vírgula", true, 1000}, {"mode", "any ou all", true, 8}, {"from", "Início RFC3339", true, 40}, {"to", "Fim RFC3339", true, 40}, {"duration_minutes", "Duração em minutos", true, 3}}, OutputFields: outputs},
		{ID: "calendar.book", Name: "Solicitar reserva", Description: "Solicita a reserva de uma opção real retornada pela disponibilidade. Respeita permissões, conflitos e aprovação da agenda.", Parameters: []ParameterSpec{conversation, {"availability_id", "Consulta de horários", true, 100}, {"slot_id", "Opção retornada", true, 100}, {"summary", "Descrição do atendimento", false, 200}}, OutputFields: outputs, Writes: true},
		{ID: "calendar.reschedule", Name: "Solicitar remarcação", Description: "Remarca somente uma reserva gerenciada pela plataforma e pertencente à empresa/conversa.", Parameters: []ParameterSpec{conversation, {"booking_id", "Reserva", true, 100}, {"expected_revision", "Revisão da reserva", true, 10}, {"availability_id", "Consulta de horários", true, 100}, {"slot_id", "Opção retornada", true, 100}}, OutputFields: outputs, Writes: true},
		{ID: "calendar.cancel", Name: "Solicitar cancelamento", Description: "Cancela somente uma reserva gerenciada pela plataforma. Exige permissão específica e respeita aprovação da agenda.", Parameters: []ParameterSpec{conversation, {"booking_id", "Reserva", true, 100}, {"expected_revision", "Revisão da reserva", true, 10}}, OutputFields: outputs, Writes: true},
	}
}
