ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS professional_level TEXT
    CHECK (professional_level IN ('estudante','tecnico','graduado','especialista','residente','enfermeiro','medico','outro'));