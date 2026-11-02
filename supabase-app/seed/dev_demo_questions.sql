-- SEED SOMENTE PARA O PROJETO DE DESENVOLVIMENTO/TESTE. Gerado a partir de src/app-enfermagem/data/questions.ts.
-- Conteúdo DEMONSTRATIVO, sem revisão editorial: nunca carregar num banco de produção.
-- Pré-requisito: existir ao menos um administrador em public.study_admins (SQL direto).

do $seed$
declare v_admin uuid; v_subj uuid; v_q uuid; v_opt uuid;
begin
  select user_id into v_admin from public.study_admins where active limit 1;
  if v_admin is null then raise exception 'seed: crie antes um administrador em public.study_admins'; end if;
  insert into public.study_subjects (slug, name, position) values ('clinica-medica', 'Clínica Médica', 1)
    on conflict (slug) do update set name = excluded.name returning id into v_subj;

  -- q1
  insert into public.study_questions (subject_id, stem, created_by, source_note) values (v_subj, 'Quando o registro de um procedimento realizado deve ser feito?', v_admin, 'demo-dev: q1') returning id into v_q;
  insert into public.study_question_options (question_id, label, body) values (v_q, 'A', 'Logo após a realização, com data e horário.') returning id into v_opt;
  insert into public.study_answer_keys (question_id, option_id) values (v_q, v_opt);
  insert into public.study_question_options (question_id, label, body) values (v_q, 'B', 'Somente no fim da semana, reunindo todos os plantões.') returning id into v_opt;
  insert into public.study_question_options (question_id, label, body) values (v_q, 'C', 'Antes de realizar, para adiantar o trabalho.') returning id into v_opt;
  insert into public.study_question_options (question_id, label, body) values (v_q, 'D', 'Apenas quando houver intercorrência.') returning id into v_opt;
  insert into public.study_explanations (question_id, body) values (v_q, 'O registro deve ser feito logo após o cuidado, com data e horário, para refletir fielmente o que foi realizado e garantir a continuidade da assistência. Registrar antes de fazer ou muito depois compromete a fidelidade das informações.');
  update public.study_questions set status = 'published', no_real_patient_data_confirmed = true, reviewed_by = v_admin, reviewed_at = now(), published_at = now() where id = v_q;

  -- q2
  insert into public.study_questions (subject_id, stem, created_by, source_note) values (v_subj, 'Qual característica torna um registro de enfermagem mais claro?', v_admin, 'demo-dev: q2') returning id into v_q;
  insert into public.study_question_options (question_id, label, body) values (v_q, 'A', 'Linguagem objetiva e informações relevantes.') returning id into v_opt;
  insert into public.study_answer_keys (question_id, option_id) values (v_q, v_opt);
  insert into public.study_question_options (question_id, label, body) values (v_q, 'B', 'Opiniões pessoais sobre o paciente.') returning id into v_opt;
  insert into public.study_question_options (question_id, label, body) values (v_q, 'C', 'Abreviações sem padronização.') returning id into v_opt;
  insert into public.study_question_options (question_id, label, body) values (v_q, 'D', 'Informações que não foram observadas.') returning id into v_opt;
  insert into public.study_explanations (question_id, body) values (v_q, 'Um registro claro descreve fatos observados, com linguagem objetiva e dados relevantes ao cuidado. Opiniões pessoais, abreviações fora de padrão e informações não observadas dificultam a leitura e podem induzir a erros.');
  update public.study_questions set status = 'published', no_real_patient_data_confirmed = true, reviewed_by = v_admin, reviewed_at = now(), published_at = now() where id = v_q;

  -- q3
  insert into public.study_questions (subject_id, stem, created_by, source_note) values (v_subj, 'O que deve acompanhar o registro de um sinal vital alterado?', v_admin, 'demo-dev: q3') returning id into v_q;
  insert into public.study_question_options (question_id, label, body) values (v_q, 'A', 'Apenas a expressão “paciente mal”.') returning id into v_opt;
  insert into public.study_question_options (question_id, label, body) values (v_q, 'B', 'O valor aferido, o horário e a conduta ou comunicação realizada.') returning id into v_opt;
  insert into public.study_answer_keys (question_id, option_id) values (v_q, v_opt);
  insert into public.study_question_options (question_id, label, body) values (v_q, 'C', 'Um diagnóstico médico presumido.') returning id into v_opt;
  insert into public.study_question_options (question_id, label, body) values (v_q, 'D', 'Nada, pois a equipe percebe a alteração sem registro.') returning id into v_opt;
  insert into public.study_explanations (question_id, body) values (v_q, 'Registrar o valor, o horário e o que foi feito (conduta, comunicação à equipe) torna a alteração rastreável e permite acompanhar a evolução. Expressões vagas ou diagnósticos presumidos não substituem dados objetivos.');
  update public.study_questions set status = 'published', no_real_patient_data_confirmed = true, reviewed_by = v_admin, reviewed_at = now(), published_at = now() where id = v_q;

  -- q4
  insert into public.study_questions (subject_id, stem, created_by, source_note) values (v_subj, 'Ao registrar a queixa de dor de uma pessoa, o mais adequado é:', v_admin, 'demo-dev: q4') returning id into v_q;
  insert into public.study_question_options (question_id, label, body) values (v_q, 'A', 'Registrar o julgamento do profissional sobre exagero da queixa.') returning id into v_opt;
  insert into public.study_question_options (question_id, label, body) values (v_q, 'B', 'Omitir a queixa se ela não for repetida na ronda seguinte.') returning id into v_opt;
  insert into public.study_question_options (question_id, label, body) values (v_q, 'C', 'Descrever o relato com as palavras da pessoa, a localização e a intensidade.') returning id into v_opt;
  insert into public.study_answer_keys (question_id, option_id) values (v_q, v_opt);
  insert into public.study_question_options (question_id, label, body) values (v_q, 'D', 'Registrar somente a medicação administrada.') returning id into v_opt;
  insert into public.study_explanations (question_id, body) values (v_q, 'O relato da pessoa, a localização e a intensidade (por exemplo, em escala numérica) compõem uma descrição fiel da dor. Julgamentos pessoais e omissões prejudicam a avaliação e o acompanhamento do quadro.');
  update public.study_questions set status = 'published', no_real_patient_data_confirmed = true, reviewed_by = v_admin, reviewed_at = now(), published_at = now() where id = v_q;

  -- q5
  insert into public.study_questions (subject_id, stem, created_by, source_note) values (v_subj, 'A anotação de enfermagem deve ser identificada com:', v_admin, 'demo-dev: q5') returning id into v_q;
  insert into public.study_question_options (question_id, label, body) values (v_q, 'A', 'Uma rubrica ilegível, para agilizar.') returning id into v_opt;
  insert into public.study_question_options (question_id, label, body) values (v_q, 'B', 'O nome da pessoa atendida.') returning id into v_opt;
  insert into public.study_question_options (question_id, label, body) values (v_q, 'C', 'Nenhuma identificação, se for plantão noturno.') returning id into v_opt;
  insert into public.study_question_options (question_id, label, body) values (v_q, 'D', 'Nome legível, categoria profissional e número de inscrição no Coren.') returning id into v_opt;
  insert into public.study_answer_keys (question_id, option_id) values (v_q, v_opt);
  insert into public.study_explanations (question_id, body) values (v_q, 'Assinatura legível, categoria profissional e número de inscrição no Coren permitem identificar quem realizou o cuidado e o registro. Rubricas ilegíveis ou ausência de identificação tiram a validade do registro.');
  update public.study_questions set status = 'published', no_real_patient_data_confirmed = true, reviewed_by = v_admin, reviewed_at = now(), published_at = now() where id = v_q;
end $seed$;
