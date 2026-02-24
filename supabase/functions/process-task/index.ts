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
    const { input_text, audio_data, audio_mime_type, user_id } = await req.json();

    if (!input_text && !audio_data) {
      return new Response(JSON.stringify({ error: "input_text or audio_data is required" }), {
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
Eres un extractor de metadatos de tareas. Tu única función es analizar el texto provisto y retornar EXCLUSIVAMENTE un objeto JSON con los siguientes campos:
- f_impact: (Impacto Financiero: cuánto impacta directamente en ingresos, del 1 al 100)
- leverage: (Apalancamiento: cuánto escala este trabajo, del 1 al 100)
- urgency: (Urgencia: cómo de urgente es en el tiempo, del 1 al 100)
- vital_impact: (Impacto Vital: importancia para la salud, identidad o misión, del 1 al 100)
- energy_level: (Nivel de energía del USUARIO, del 1 al 10. Si no se menciona, retorna 10)
- project_id: EXACTAMENTE uno de estos valores: "PRJ-MIGA", "PRJ-ESENCIAL", "PRJ-ES-KUCHEN", "PRJ-ES-QUINTA", "PRJ-ES-QUALISTER", "PRJ-ES-CHELITO", "PRJ-ESTUDIO", "PRJ-CREAMOS", "PRJ-VITAL", "PRJ-NONE"
  Reglas de asignación de project_id (en orden de prioridad, usar el PRIMERO que aplique):
   * "PRJ-VITAL"        → descanso, dormir, recuperación, salud, sueño, ejercicio, energía baja.
   * "PRJ-MIGA"         → MIGA, SaaS, MVP, landing MVP, beta, App Beta, producto propio.
   * "PRJ-ES-KUCHEN"    → Kuchen, kuchencl, tienda de tortas, pastelería Kuchen.
   * "PRJ-ES-QUALISTER" → Qualister, Manual de Marca, branding Qualister, identidad visual, caso de estudio Esencial.
   * "PRJ-ES-QUINTA"    → La Quinta, quinta, consultoria UX, service design.
   * "PRJ-ES-CHELITO"   → Chelito, Chelito de Montiel, panadería, marketing panadería.
   * "PRJ-ESENCIAL"     → Esencial Work, agencia, lead generation, propuesta comercial, cliente nuevo, caso de estudio.
   * "PRJ-ESTUDIO"      → Coursera, estudio, certificación, curso, aprendizaje, UX research.
   * "PRJ-CREAMOS"      → Creamos Juntos, contenido, podcast, video, post, redes sociales, marca personal.
   * "PRJ-NONE"         → solo si NO encaja en ninguna de las anteriores.
- title: un título conciso en formato 'Verbo Infinitivo + Objeto'. Máximo 7 palabras.
- estimated_time: tiempo estimado en minutos (default 25).

RESPONDE ÚNICAMENTE con el objeto JSON. No incluyas explicaciones ni texto adicional.
${strategyContext}
    `;

    // 3. Prepare Content for Gemini (Text or Audio Multimodal)
    const contents: any[] = [];
    
    // If audio is present, add the audio part
    if (audio_data && audio_mime_type) {
      contents.push({
        inlineData: {
          data: audio_data,
          mimeType: audio_mime_type
        }
      });
    }
    
    // Always add the text prompt
    const promptText = input_text || "Por favor, analiza la siguiente nota de voz.";
    contents.push(promptText);

    // Call Gemini
    const geminiResponse = await geminiAi.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
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

    // ─── LOOKUP en tabla projects (Estrategia v9) ──────────────────────────
    // Si el project_id no existe, se usa PRJ-NONE como fallback (1.0x, energy_req=5)
    // Inicializamos con los valores de fallback para evitar null checks
    let projectData = { leverage_multiplier: 1.0, energy_req: 5, needs_strategic_review: true };
    let needsStrategicReview = false;

    const { data: projectRow, error: projectErr } = await supabase
      .from('projects')
      .select('leverage_multiplier, energy_req, needs_strategic_review')
      .eq('project_id', projectId)
      .maybeSingle();

    if (projectErr) {
      console.warn(`[projects] Error consultando project_id '${projectId}':`, projectErr.message);
    }

    if (projectRow) {
      projectData = projectRow;
      needsStrategicReview = projectRow.needs_strategic_review;
    } else {
      // Fallback: proyecto desconocido → PRJ-NONE (1.0x, energy_req=5)
      console.warn(`[projects] project_id desconocido: '${projectId}'. Usando fallback PRJ-NONE.`);
      needsStrategicReview = true;
    }

    function calculateScore(
      metrics: { fin: number; apal: number; urg: number; vit: number },
      mult: number,
      energyReq: number,
      currentEnergy: number
    ) {
      // Pesos Oficiales — Fórmula v9 (invariables)
      // Score = (fin×0.35) + (apal×0.30×leverage_multiplier) + (urg×0.15) + (vit×0.20)
      const weights = { fin: 0.35, apal: 0.30, urg: 0.15, vit: 0.20 };

      // Paso 1: Score Base con multiplicador desde la BD
      const baseScore = (metrics.fin * weights.fin) +
                        (metrics.apal * weights.apal * mult) +
                        (metrics.urg * weights.urg) +
                        (metrics.vit * weights.vit);

      // Paso 2: Factor de Viabilidad V = min(Energia / Req, 1.0)
      const viability = Math.min(currentEnergy / energyReq, 1.0);

      // Paso 3: Score Final = min(round(Base × V), 100)
      const rawFinalScore = Math.min(Math.round(baseScore * viability), 100);

      return { score: rawFinalScore, viability, mult, baseScore };
    }

    const mult      = projectData.leverage_multiplier;
    const energyReq = projectData.energy_req;
    const metrics   = { fin: pF, apal: pA, urg: pU, vit: pV };
    let { score: finalScore, viability, baseScore } = calculateScore(metrics, mult, energyReq, energy);

    let isEnergyBlocked = false;

    // Hard Block Energético vs Cálculo Normal
    if (projectId !== 'PRJ-VITAL' && (energyReq - energy >= 3)) {
      isEnergyBlocked = true;
      finalScore = 0; // Forced to 0 because blocked
    }

    // Auditoría Matemática Requerida (campo 'audit' como pedido en la especificación)
    const audit = {
      paso_1_base: `(${pF}×0.35) + (${pA}×0.30×${mult}) + (${pU}×0.15) + (${pV}×0.20) = ${baseScore.toFixed(2)}`,
      paso_2_viabilidad: `V = min(${energy}/${energyReq}, 1.0) = ${viability.toFixed(3)}`,
      paso_3_final: `Score_Final = round(${baseScore.toFixed(2)} × ${viability.toFixed(3)}) = ${finalScore}`,
      is_p0: finalScore >= 90,
      is_energy_blocked: isEnergyBlocked,
      raw_inputs: { pF, pA, pU, pV, energy, energyReq }
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

    const strategicReviewFlag = needsStrategicReview ? '\n⚠️ Revisión Estratégica Pendiente: proyecto no reconocido en Estrategia v9.' : '';
    const formattedDescription = `[AI Generated]\nProject: ${projectId}\nScore calculado: ${finalScore}\n(Fin: ${pF}, Apal: ${pA}, Urg: ${pU}, Vit: ${pV}, Energía: ${energy}, Req: ${energyReq}, Mult: ${mult}x)${strategicReviewFlag}\n\nOriginal: ${input_text}`;

    // 6. Save directly to Supabase Public Cards table
    const newCardData = {
      title: title,
      description: formattedDescription,
      list_id: isEnergyBlocked ? 'queue' : 'inbox', 
      priority: finalScore >= 90 ? 'high' : finalScore >= 75 ? 'medium' : 'low',
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
      is_p0: finalScore >= 90,
      priority: savedCard.priority,
      project_id: projectId,
      is_sleep_blocked: isSleepBlock,
      is_energy_blocked: isEnergyBlocked,
      card_id: savedCard.id,
      audit: audit
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
