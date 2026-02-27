import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Impacto energético por tipo de proyecto
const ENERGY_IMPACT: Record<string, number> = {
  'PRJ-VITAL': +3,   // Descanso recupera energía
  'default': -2,     // Todo lo demás consume energía
};

// Requisitos de energía por proyecto (mismo mapping que process-task)
const ENERGY_REQS: Record<string, number> = {
  'PRJ-MIGA': 9,
  'PRJ-VITAL': 1,
  'PRJ-KUCHEN': 8,
  'PRJ-QUAL': 7,
};

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { task_id, project_id, user_id = 'default_user' } = await request.json();

    if (!task_id || !project_id) {
      return new Response(JSON.stringify({ error: "task_id y project_id son requeridos" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400
      });
    }

    // 1. Hard Block de Sueño (GMT-6, antes de cualquier calculo)
    const now = new Date();
    const utcHour = now.getUTCHours();
    const localHour = (utcHour - 6 + 24) % 24;
    const isSleepBlock = localHour >= 21 || localHour < 5;

    if (isSleepBlock) {
      // Marcar la tarea como completada igualmente
      await supabase.from('cards').update({ 
        status: 'completed',
        completed: true,
        completed_at: now.toISOString()
      }).eq('id', task_id);
      return new Response(JSON.stringify({
        next_task: null,
        new_energy: null,
        is_sleep_blocked: true,
        message: "Bloqueo de descanso activo. ¡Excelente trabajo hoy! Descansa y vuelve mañana."
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200
      });
    }

    // 2. Marcar la tarea actual como completada
    const { error: completeErr } = await supabase
      .from('cards')
      .update({ 
        status: 'completed',
        completed: true,
        completed_at: now.toISOString()
      })
      .eq('id', task_id);

    if (completeErr) {
      console.error("Error al completar tarea:", completeErr);
      throw new Error(`No se pudo completar la tarea: ${completeErr.message}`);
    }

    // 3. Obtener energía actual del usuario
    const { data: statusRow, error: statusErr } = await supabase
      .from('user_status')
      .select('current_energy')
      .eq('user_id', user_id)
      .single();

    let currentEnergy = statusRow?.current_energy ?? 10;

    // 4. Calcular impacto energético
    const impact = ENERGY_IMPACT[project_id] ?? ENERGY_IMPACT['default'];
    const newEnergy = Math.min(Math.max(currentEnergy + impact, 1), 10);

    // 5. Actualizar energía en user_status (upsert para crearla si no existe)
    const { error: upsertErr } = await supabase
      .from('user_status')
      .upsert({
        user_id: user_id,
        current_energy: newEnergy,
        last_updated: now.toISOString()
      }, { onConflict: 'user_id' });

    if (upsertErr) {
      console.error("Error al actualizar user_status:", upsertErr);
      throw new Error(`No se pudo actualizar energía: ${upsertErr.message}`);
    }

    // 6. Encontrar la siguiente tarea P0 con la nueva energía
    const { data: pendingCards, error: fetchErr } = await supabase
      .from('cards')
      .select('*')
      .eq('status', 'pending')
      .is('due_date', null) // No tiene bloqueo de sueño activo
      .order('score', { ascending: false })
      .limit(10);

    let nextTask = null;

    if (!fetchErr && pendingCards && pendingCards.length > 0) {
      // Filtrar por viabilidad energética (con la nueva energía)
      for (const card of pendingCards) {
        const cardProjectId = card.project_id || 'PRJ-NONE';
        const energyReq = ENERGY_REQS[cardProjectId] || 5;
        const viability = newEnergy / energyReq;

        // Solo mostrar la tarea si la viabilidad es suficiente (energía no sobrepasa la brecha de 3)
        if (energyReq - newEnergy < 3) {
          nextTask = {
            ...card,
            effective_score: Math.min(Math.round((card.score || 0) * Math.min(viability, 1.0)), 100),
            energy_viability: Math.min(viability, 1.0).toFixed(2)
          };
          break;
        }
      }
    }

    // 7. Response
    return new Response(JSON.stringify({
      next_task: nextTask,
      new_energy: newEnergy,
      energy_delta: impact,
      is_sleep_blocked: false,
      completed_task_id: task_id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (err: any) {
    console.error("Complete Task Error Detailed:", {
      message: err.message,
      stack: err.stack,
      details: err.details || err
    });
    return new Response(JSON.stringify({ error: err.message, details: err.details || err }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
})
