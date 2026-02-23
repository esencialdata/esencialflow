import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GoogleGenAI } from "npm:@google/genai"

const geminiAi = new GoogleGenAI({ apiKey: Deno.env.get('GEMINI_API_KEY') || '' });
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { input_text, user_id } = await req.json();

    if (!input_text) {
      return new Response(JSON.stringify({ error: "input_text is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400
      });
    }

    // 1. Convert input to vector (RAG) using text-embedding model
    let strategyContext = "";
    try {
      const embeddingRes = await geminiAi.models.embedContent({
        model: 'text-embedding-004',
        contents: input_text,
      });
      const embedding = embeddingRes.embeddings?.[0]?.values;

      if (embedding) {
        // Query Supabase strategy vectors (assuming match_strategy_vectors exists)
        const { data: strategies, error: rpcError } = await supabase.rpc('match_strategy_vectors', {
          query_embedding: embedding,
          match_threshold: 0.7,
          match_count: 3
        });

        if (!rpcError && strategies && strategies.length > 0) {
          strategyContext = `\nREGLAS ESTRATÉGICAS APLICABLES V4.0:\n` + strategies.map((s: any) => `- ${s.content}`).join('\n');
        }
      }
    } catch (embErr) {
      console.warn("Could not retrieve strategy embeddings, proceeding with default behavior.", embErr);
    }

    // 2. Base System Instruction + Dynamic Strategies
    const systemInstruction = `
Eres un asistente experto en priorización radical. Analiza la petición del usuario y extrae la siguiente información en estricto formato JSON puro.
Extrae estos 4 valores del 1 al 100 evaluando el texto dado el contexto de un CEO:
- f_impact: (Impacto Financiero 1-100)
- leverage: (Apalancamiento 1-100)
- urgency: (Urgencia 1-100)
- vital_impact: (Impacto Vital 1-100)
- energy_level: (Nivel de energía del 1 al 10 inferido del texto. Usa 10 por defecto si no se menciona cansancio, salud o energía baja)

También define:
- project_id: si notas que pertenece a PRJ-VITAL, PRJ-MIGA, PRJ-ESENCIAL, PRJ-KUCHEN. Sino, usa "PRJ-NONE"
- title: un título conciso y accionable de la tarea (Verbo Infinitivo + Proyecto / Tarea).
- estimated_time: en minutos (default 25).
${strategyContext}
    `;

    // 3. Call Gemini
    const geminiResponse = await geminiAi.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: input_text,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      }
    });

    const outputText = geminiResponse.text || "{}";
    const parsedData = JSON.parse(outputText);

    // 4. Logic: Hard Math Score Calculation & Energy State (Exact Formula by User)
    const energy = parsedData.energy_level !== undefined ? Number(parsedData.energy_level) : 10;
    
    // Regla de PRJ-VITAL Exclusiva (Si energía < 5)
    if (energy < 5) {
      parsedData.title = 'Recuperar energía / Descanso vital';
      parsedData.project_id = 'PRJ-VITAL';
      parsedData.f_impact = 0;
      parsedData.leverage = 100;
      parsedData.urgency = 80;
      parsedData.vital_impact = 100;
    }

    const pF = parsedData.f_impact || 0;
    const pA = parsedData.leverage || 0;
    const pU = parsedData.urgency || 0;
    const pV = parsedData.vital_impact || 0;
    const projectId = parsedData.project_id || 'PRJ-NONE';
    const title = parsedData.title || 'Nueva Tarea Obtenida';

    function calculateScore(metrics: any, projectType: string, currentEnergy: number) {
      // 1. Extraer pesos oficiales
      const weights = { fin: 0.35, apal: 0.30, urg: 0.15, vit: 0.20 };
      const multipliers: Record<string, number> = { 'PRJ-VITAL': 2.0, 'PRJ-MIGA': 1.5, 'PRJ-ESENCIAL': 1.2, 'PRJ-KUCHEN': 1.0 };
      
      // 2. Definir Requisitos de Energía
      const energyReqs: Record<string, number> = { 'PRJ-MIGA': 9, 'PRJ-VITAL': 1, 'PRJ-KUCHEN': 8, 'PRJ-QUAL': 7 };
      const calculatedReq = energyReqs[projectType] || 5;

      // 3. Cálculo de Viabilidad (Penalización por Energía)
      const viability = Math.min(currentEnergy / calculatedReq, 1.0);

      // 4. Cálculo del Score Base con Multiplicador en Apalancamiento
      const mult = multipliers[projectType] || 1.0;
      const baseScore = (metrics.fin * weights.fin) + 
                        (metrics.apal * weights.apal * mult) + 
                        (metrics.urg * weights.urg) + 
                        (metrics.vit * weights.vit);

      // 5. Resultado Real
      return {
        score: Math.min(Math.round(baseScore * viability), 100),
        calculatedReq: calculatedReq,
        viability: viability,
        mult: mult,
        baseScore: baseScore
      };
    }

    const metrics = { fin: pF, apal: pA, urg: pU, vit: pV };
    let { score: finalScore, calculatedReq: energyReq, viability, mult, baseScore } = calculateScore(metrics, projectId, energy);

    let isEnergyBlocked = false;

    // Hard Block Energético vs Cálculo Normal
    if (projectId !== 'PRJ-VITAL' && (energyReq - energy >= 3)) {
      isEnergyBlocked = true;
      finalScore = 0; // Forced to 0 because blocked
    }

    // Auditoría Matemática Requerida
    const mathSteps = {
      base_score_formula: `(${pF}*0.35) + (${pA}*0.30*${mult}) + (${pU}*0.15) + (${pV}*0.20) = ${baseScore.toFixed(2)}`,
      viability_factor: `min(${energy}/${energyReq}, 1.0) = ${viability.toFixed(2)}`,
      final_equation: `round(${baseScore.toFixed(2)} * ${viability.toFixed(2)}) = ${finalScore}`,
      computed_final_score: finalScore,
      is_energy_blocked: isEnergyBlocked
    };

    // 5. Logic: Hard Block de Sueño Server Time
    // Adjust logic to check local hours (you can pass the timezone offset if needed from client, or using basic JS Date assuming UTC or specific timezone implementation via timezone param). 
    // Assuming simple backend logic here for demonstration, you can modify it to parse client time headers.
    const now = new Date();
    // For local logic, let's grab it effectively if server is in matching TZ or offset parameter is passed.
    // For absolute accuracy over a PWA, we should trust a client parameter, but for security, we evaluate mathematically here. Let's use getUTCHours as a fallback if timezone isn't sent, but we will simply check numeric if sent, else default to server TZ.
    // Given the prompt: local time > 21:00 or < 05:00
    // To strictly avoid browser timezone manipulation, we could rely on server TZ. Assuming server runs in GMT-6 for Mexico or similar.
    // Let's adopt a robust UTC to Mexico City / GMT-6 offset for example:
    const utcHour = now.getUTCHours();
    const localHour = (utcHour - 6 + 24) % 24; // Simple GMT-6 hardcoded for CEO location

    const isSleepBlock = localHour >= 21 || localHour < 5;

    let dueDate = null;
    if (isSleepBlock) {
      // Force due_date tomorrow at 06:00
      const tomorrow = new Date();
      if (localHour >= 21) {
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      }
      tomorrow.setUTCHours(12, 0, 0, 0); // 12:00 UTC = 06:00 GMT-6
      dueDate = tomorrow.toISOString();
    }

    const formattedDescription = `[AI Generated]\nProject: ${projectId}\nScore calculado: ${finalScore}\n(Fin: ${pF}, Apal: ${pA}, Urg: ${pU}, Vit: ${pV}, Energía: ${energy}, Req: ${energyReq})\n\nOriginal: ${input_text}`;

    // 6. Save directly to Supabase Public Cards table
    const newCardData = {
      title: title,
      description: formattedDescription,
      list_id: isEnergyBlocked ? 'queue' : 'inbox', 
      priority: finalScore >= 90 ? 'high' : finalScore >= 60 ? 'medium' : 'low',
      due_date: isSleepBlock ? dueDate : null,
      status: isEnergyBlocked ? 'BLOCKED_BY_ENERGY' : 'PENDING',
      assigned_to_user_id: user_id, // ensure user_id is coming from JWT theoretically if using supabase auth 
      estimated_time: parsedData.estimated_time || 25,
      actual_time: 0,
    };

    const { data: savedCard, error: supaErr } = await supabase
      .from('cards')
      .insert(newCardData)
      .select()
      .single();

    if (supaErr) {
      console.error("Supabase Card Insert Error:", supaErr);
      throw new Error(`Failed to insert into Supabase: ${supaErr.message}`);
    }

    // 7. Strict JSON Response back to Client (UI)
    const strictUiResponse = {
      title: savedCard.title,
      score: finalScore,
      priority: savedCard.priority,
      project_id: projectId,
      is_sleep_blocked: isSleepBlock,
      is_energy_blocked: isEnergyBlocked,
      card_id: savedCard.id,
      math_steps: mathSteps
    };

    return new Response(JSON.stringify(strictUiResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (err: any) {
    console.error("Process Task Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
})
