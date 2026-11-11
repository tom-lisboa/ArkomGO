package main

// Seeded once in the two pre-existing fictitious organizations. Never imports
// production data and never overwrites a client's edited or published profile.
func exampleBusiness(org string) BusinessProfile {
	all := func() []string { return []string{"all"} }
	if org == "org_demo_beta" {
		return BusinessProfile{Name: "Beta Escola de Idiomas · fictícia", Description: "Escola fictícia de idiomas para adultos. Dados exclusivos para testar separação entre empresas.", Audience: "Adultos que procuram inglês para trabalho e viagens.", Region: "Atendimento online em todo o Brasil.", Timezone: "America/Sao_Paulo", Tone: "Didático, acolhedor e claro. Sem prometer fluência em prazo fixo.", EnabledSolutions: []string{"sdr", "atendimento", "marketing"}, Sources: []BusinessSource{{ID: "catalogo-beta", Title: "Catálogo de teste Beta", Content: "Consulte os valores e o formato nas ofertas estruturadas desta base. Aula de apresentação gratuita de 20 minutos, sujeita à confirmação de horário. Não há garantia de fluência em prazo determinado.", Status: "approved", Solutions: all()}}, Offers: []BusinessOffer{{ID: "ingles-grupo", Name: "Inglês em grupo", Description: "Duas aulas online por semana para adultos.", AmountCents: 28000, Cadence: "monthly", Conditions: "Disponibilidade de turma e nível confirmados pela equipe. Matrícula sem taxa neste exemplo.", SourceID: "catalogo-beta", Solutions: all(), Active: true}}, Facts: []BusinessFact{{ID: "horarios", Topic: "Horário de atendimento", Value: "Segunda a sexta, 9h às 18h, horário de Brasília.", SourceID: "catalogo-beta", Solutions: all()}, {ID: "qualificacao", Topic: "Qualificação", Value: "Perguntar objetivo com o idioma, nível atual e horários disponíveis. Não repetir dados já informados.", SourceID: "catalogo-beta", Solutions: []string{"sdr"}}, {ID: "resultados", Topic: "Promessas de resultado", Value: "Não prometer fluência nem prazo de aprendizado. Encaminhar ao professor para avaliação.", SourceID: "catalogo-beta", Solutions: all()}}}
	}
	return BusinessProfile{
		Name:        "Alfa Automação Comercial · fictícia",
		Description: "Empresa fictícia que implanta ferramentas de organização comercial para pequenas empresas: cadastro de contatos, funil de vendas e acompanhamento da equipe. Este catálogo existe somente para homologar o novo núcleo da Arkom.",
		Audience:    "Pequenas empresas de serviços, com equipes de 1 a 5 vendedores, que hoje acompanham oportunidades em planilhas e WhatsApp.",
		Region:      "Implantação remota em todo o Brasil. Visita presencial apenas em Cuiabá e Várzea Grande, mediante confirmação e orçamento separado.",
		Timezone:    "America/Cuiaba", Tone: "Consultivo, direto e cordial, em português brasileiro. Fazer uma pergunta por vez e usar informações já recebidas. Não inventar condições nem confirmar ações sem retorno da ferramenta.",
		EnabledSolutions: []string{"sdr", "atendimento", "marketing"},
		Sources: []BusinessSource{
			{ID: "catalogo-alfa", Title: "Catálogo comercial fictício · edição 1", Content: "Os preços, taxas de implantação, periodicidade e usuários incluídos são definidos nas ofertas estruturadas desta base. Incluem configuração inicial do funil e treinamento remoto. Tarifas de mensagens, serviços de terceiros e integrações personalizadas não estão incluídos. Catálogo fictício, sem oferta real.", Status: "approved", Solutions: all()},
			{ID: "operacao-alfa", Title: "Regras de operação e atendimento · exemplo", Content: "Os horários, fuso, duração do diagnóstico e prazo estimado estão nas regras estruturadas desta base. Reunião depende da confirmação real da agenda. Implantação exige recebimento de acessos e aprovação de escopo. Desconto e alteração de contrato exigem aprovação humana. Não garantir aumento de vendas nem percentual de conversão.", Status: "approved", Solutions: all()},
			{ID: "roteiro-sdr", Title: "Roteiro de qualificação comercial · exemplo", Content: "Identificar nome, empresa, segmento, quantidade de vendedores, volume aproximado de contatos, ferramenta atual e principal dificuldade. Aproveitar dados já informados. Propor diagnóstico quando houver aderência. Fora do escopo, esclarecer a limitação e oferecer encaminhamento humano.", Status: "approved", Solutions: []string{"sdr"}},
		},
		Offers: []BusinessOffer{
			{ID: "essencial", Name: "Plano Essencial", Description: "Organização do funil, cadastro de contatos e treinamento remoto para até 2 usuários.", AmountCents: 49000, SetupCents: 99000, Cadence: "monthly", Conditions: "Implantação cobrada uma única vez. Tarifas de mensagens, terceiros e integrações personalizadas à parte. Valores fictícios.", SourceID: "catalogo-alfa", Solutions: all(), Active: true},
			{ID: "equipe", Name: "Plano Equipe", Description: "Organização do funil, acompanhamento e treinamento remoto para até 5 usuários.", AmountCents: 89000, SetupCents: 149000, Cadence: "monthly", Conditions: "Implantação cobrada uma única vez. Escopo e condições dependem da proposta aprovada. Valores fictícios.", SourceID: "catalogo-alfa", Solutions: all(), Active: true},
		},
		Facts: []BusinessFact{
			{ID: "horarios", Topic: "Horário de atendimento", Value: "Segunda a sexta, das 8h às 18h, no fuso America/Cuiaba. Fora do horário, registrar interesse e informar o próximo período de atendimento.", SourceID: "operacao-alfa", Solutions: all()},
			{ID: "prazo", Topic: "Prazo de implantação", Value: "Estimativa de 5 a 10 dias úteis após recebimento dos acessos e aprovação do escopo. A equipe confirma a data na proposta.", SourceID: "operacao-alfa", Solutions: all()},
			{ID: "desconto", Topic: "Descontos e exceções", Value: "Não conceder desconto automaticamente. Registrar a solicitação e encaminhar para aprovação humana.", SourceID: "operacao-alfa", Solutions: all()},
			{ID: "resultados", Topic: "Promessas de resultado", Value: "Não garantir aumento de vendas, faturamento ou conversão. Explicar as funcionalidades e propor diagnóstico para avaliar aderência.", SourceID: "operacao-alfa", Solutions: all()},
			{ID: "agenda", Topic: "Reunião de diagnóstico", Value: "Diagnóstico online gratuito de 30 minutos. Só confirmar uma reunião após retorno real da agenda; enquanto a agenda não estiver conectada, coletar preferência e encaminhar à equipe.", SourceID: "operacao-alfa", Solutions: all()},
			{ID: "qualificacao", Topic: "Qualificação do SDR", Value: "Identificar nome, empresa, segmento, vendedores, volume de contatos, ferramenta atual e principal dificuldade. Perguntar apenas o que falta e respeitar pausa humana e pedido para não receber contato.", SourceID: "roteiro-sdr", Solutions: []string{"sdr"}},
		},
	}
}
