import 'dart:async';

import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import 'platform.dart' show ArkomWordmark;
import 'visuals.dart';

class PlatformLogin extends StatefulWidget {
  const PlatformLogin({
    super.key,
    required this.onLogin,
    this.onSignup,
    this.initialSignup = false,
    this.notice = '',
  });

  final Future<bool> Function(String email, String password) onLogin;
  final Future<bool> Function(Map<String, String> details)? onSignup;
  final bool initialSignup;
  final String notice;

  @override
  State<PlatformLogin> createState() => _PlatformLoginState();
}

class _PlatformLoginState extends State<PlatformLogin> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _showPassword = false;
  final _company = TextEditingController();
  final _description = TextEditingController();
  late bool _signup;
  bool _preparing = false;
  String _timezone = 'America/Sao_Paulo';
  String _error = '';

  @override
  void initState() {
    super.initState();
    _signup = widget.initialSignup && widget.onSignup != null;
  }

  void _switch() => setState(() {
    _signup = !_signup;
    _error = '';
    _password.clear();
  });

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _company.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final email = _email.text.trim(), password = _password.text;
      var preparing = _signup
          ? await widget.onSignup!({
              'email': email,
              'password': password,
              'company': _company.text.trim(),
              'description': _description.text.trim(),
              'timezone': _timezone,
            })
          : await widget.onLogin(email, password);
      if (mounted && preparing) setState(() => _preparing = true);
      final deadline = DateTime.now().add(const Duration(minutes: 2));
      while (preparing && mounted && DateTime.now().isBefore(deadline)) {
        await Future<void>.delayed(const Duration(seconds: 4));
        if (!mounted) return;
        preparing = await widget.onLogin(email, password);
      }
      if (!mounted) return;
      if (preparing) {
        setState(() {
          _signup = false;
          _error = 'Sua empresa ainda está sendo preparada. Tente entrar novamente em instantes.';
        });
      } else {
        TextInput.finishAutofillContext();
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString().replaceFirst('Error: ', ''));
    } finally {
      if (mounted) setState(() => _busy = _preparing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final wide = width >= 900;
    final message = _error.isEmpty ? widget.notice : _error;
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: RadialGradient(
          center: Alignment(-.8, -.85),
          radius: 1.5,
          colors: [Color(0xff1b202c), Color(0xff101217), ink],
        ),
      ),
      child: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: EdgeInsets.all(wide ? 40 : 20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1024),
              child: Row(
                children: [
                  if (wide)
                    const Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(right: 72),
                        child: _WorkspaceIntro(),
                      ),
                    ),
                  Expanded(
                    child: Container(
                      padding: EdgeInsets.all(wide ? 40 : 24),
                      decoration: BoxDecoration(
                        color: const Color(0xff111318),
                        border: Border.all(color: const Color(0xff353134)),
                        borderRadius: BorderRadius.circular(24),
                      ),
                      child: AutofillGroup(
                        child: Form(
                          key: _form,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              if (!wide) ...[
                                const Align(
                                  alignment: Alignment.centerLeft,
                                  child: ArkomWordmark(compact: false),
                                ),
                                const SizedBox(height: 28),
                              ],
                              Text(
                                _signup ? 'Crie sua conta' : 'Entre na Arkom',
                                style: Theme.of(context)
                                    .textTheme
                                    .headlineMedium
                                    ?.copyWith(fontWeight: FontWeight.w500),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                _signup
                                    ? 'Conte um pouco sobre sua empresa para prepararmos seu time.'
                                    : 'Acesse o espaço de trabalho da sua empresa.',
                                style: const TextStyle(
                                  color: Color(0xffacaeb5),
                                ),
                              ),
                              const SizedBox(height: 28),
                              if (_signup) ...[
                                TextFormField(
                                  controller: _company,
                                  enabled: !_busy,
                                  maxLength: 100,
                                  decoration: const InputDecoration(
                                    labelText: 'Nome da empresa',
                                    counterText: '',
                                  ),
                                  validator: (value) =>
                                      value == null || value.trim().isEmpty
                                      ? 'Informe o nome da empresa.'
                                      : null,
                                ),
                                const SizedBox(height: 16),
                                TextFormField(
                                  controller: _description,
                                  enabled: !_busy,
                                  maxLength: 1000,
                                  minLines: 2,
                                  maxLines: 4,
                                  decoration: const InputDecoration(
                                    labelText: 'O que sua empresa faz?',
                                    counterText: '',
                                  ),
                                  validator: (value) =>
                                      value == null || value.trim().length < 12
                                      ? 'Descreva a atividade em pelo menos 12 caracteres.'
                                      : null,
                                ),
                                const SizedBox(height: 16),
                                DropdownButtonFormField<String>(
                                  initialValue: _timezone,
                                  decoration: const InputDecoration(
                                    labelText: 'Fuso horário',
                                  ),
                                  items: const [
                                    DropdownMenuItem(
                                      value: 'America/Sao_Paulo',
                                      child: Text('Brasília (UTC−3)'),
                                    ),
                                    DropdownMenuItem(
                                      value: 'America/Cuiaba',
                                      child: Text('Cuiabá (UTC−4)'),
                                    ),
                                    DropdownMenuItem(
                                      value: 'America/Rio_Branco',
                                      child: Text('Acre (UTC−5)'),
                                    ),
                                    DropdownMenuItem(
                                      value: 'America/Noronha',
                                      child: Text(
                                        'Fernando de Noronha (UTC−2)',
                                      ),
                                    ),
                                  ],
                                  onChanged: _busy
                                      ? null
                                      : (zone) =>
                                            setState(() => _timezone = zone!),
                                ),
                                const SizedBox(height: 16),
                              ],
                              TextFormField(
                                controller: _email,
                                enabled: !_busy,
                                keyboardType: TextInputType.emailAddress,
                                textInputAction: TextInputAction.next,
                                autofillHints: const [AutofillHints.username],
                                autocorrect: false,
                                decoration: const InputDecoration(
                                  labelText: 'E-mail',
                                  prefixIcon: Icon(Icons.mail_outline),
                                ),
                                validator: (value) =>
                                    value == null || !value.trim().contains('@')
                                    ? 'Informe seu e-mail.'
                                    : null,
                              ),
                              const SizedBox(height: 16),
                              TextFormField(
                                controller: _password,
                                enabled: !_busy,
                                obscureText: !_showPassword,
                                textInputAction: TextInputAction.done,
                                autofillHints: _signup
                                    ? const [AutofillHints.newPassword]
                                    : const [AutofillHints.password],
                                onFieldSubmitted: (_) => _submit(),
                                decoration: InputDecoration(
                                  labelText: 'Senha',
                                  prefixIcon: const Icon(Icons.lock_outline),
                                  suffixIcon: IconButton(
                                    tooltip: _showPassword
                                        ? 'Ocultar senha'
                                        : 'Mostrar senha',
                                    icon: Icon(
                                      _showPassword
                                          ? Icons.visibility_off
                                          : Icons.visibility,
                                    ),
                                    onPressed: () => setState(
                                      () => _showPassword = !_showPassword,
                                    ),
                                  ),
                                ),
                                validator: (value) =>
                                    value == null || value.isEmpty
                                    ? 'Informe sua senha.'
                                    : _signup && value.length < 12
                                    ? 'Use pelo menos 12 caracteres.'
                                    : null,
                              ),
                              if (message.isNotEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(top: 14),
                                  child: Semantics(
                                    liveRegion: true,
                                    child: Text(
                                      message,
                                      style: const TextStyle(
                                        color: Color(0xffffb4a8),
                                      ),
                                    ),
                                  ),
                                ),
                              const SizedBox(height: 24),
                              FilledButton(
                                onPressed: _busy ? null : _submit,
                                style: FilledButton.styleFrom(
                                  minimumSize: const Size.fromHeight(50),
                                  backgroundColor: gold,
                                  foregroundColor: ink,
                                ),
                                child: Text(
                                  _preparing
                                      ? 'Preparando sua empresa…'
                                      : _busy
                                      ? 'Aguarde…'
                                      : _signup
                                      ? 'Criar minha conta'
                                      : 'Entrar',
                                ),
                              ),
                              if (widget.onSignup != null) ...[
                                const SizedBox(height: 10),
                                TextButton(
                                  onPressed: _busy ? null : _switch,
                                  child: Text(
                                    _signup ? 'Já tenho conta' : 'Criar conta',
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _WorkspaceIntro extends StatelessWidget {
  const _WorkspaceIntro();

  @override
  Widget build(BuildContext context) => const Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      ArkomWordmark(compact: false),
      SizedBox(height: 46),
      Text(
        'Seu time de IA,\nem um só lugar.',
        style: TextStyle(
          fontFamily: 'ArkomEditorial',
          fontSize: 56,
          height: 1.12,
          color: Color(0xfff2eee5),
        ),
      ),
      SizedBox(height: 18),
      Text(
        'Acompanhe sua operação e crie novas ferramentas com o Genesis.',
        style: TextStyle(fontSize: 16, height: 1.55, color: Color(0xffacaeb5)),
      ),
    ],
  );
}
