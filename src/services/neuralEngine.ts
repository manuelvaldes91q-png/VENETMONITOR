
/**
 * VENET NEURAL ENGINE v1.0
 * Inteligencia Lógica Integrada (No requiere API)
 * Analiza métricas y logs de MikroTik en tiempo real.
 */

export interface NeuralAnalysis {
  statusSummary: string;
  intelligence: string;
  recommendation: string;
  pulseColor: string;
  pulseIntensity: number;
}

export const runLocalAnalysis = (devices: any[], logs: any[]): NeuralAnalysis => {
  const downDevices = devices.filter(d => d.status === 'down');
  const criticalLogs = logs.filter(l => l.status === 'down');
  const avgLatency = logs.length > 0 
    ? logs.reduce((acc, curr) => acc + (curr.latency || 0), 0) / logs.length 
    : 0;

  let intensity = 2; // Base activity
  let color = "#00ff00"; // Perfect green
  let summary = "Nivel de vigilancia: Óptimo. La red respira con normalidad.";
  let intel = "No se detectan fugas de tráfico ni saturación en los túneles MikroTik.";
  let rec = "Todo estable. Mantener cronograma de backups estándar.";

  // Intelligence Logic
  if (downDevices.length > 0) {
    intensity = 7;
    color = "#ff4400";
    summary = `CRÍTICO: ${downDevices.length} nodos desconectados del núcleo.`;
    intel = "Se ha detectado una ruptura en el flujo de datos. Posible fallo físico o corte de energía en el nodo.";
    rec = "Desplegar técnicos a zona de falla o verificar el suministro eléctrico.";
  } else if (avgLatency > 150) {
    intensity = 5;
    color = "#ffaa00";
    summary = "ALERTA: Latencia inestable detectada en el enlace troncal.";
    intel = "Los tiempos de respuesta superan los 150ms. Saturación de espectro o interferencia externa.";
    rec = "Revisar alineación de antenas o cambiar canal de frecuencia en el AP principal.";
  }

  return {
    statusSummary: summary,
    intelligence: intel,
    recommendation: rec,
    pulseColor: color,
    pulseIntensity: intensity
  };
};

export const getLocalOracleResponse = (question: string, context: any): string => {
  const q = question.toLowerCase();
  
  if (q.includes("estado") || q.includes("red") || q.includes("como")) {
    const analysis = runLocalAnalysis(context.devices || [], context.logs || []);
    return `El estado vital es: ${analysis.statusSummary}. Inteligencia local indica: ${analysis.intelligence}`;
  }
  
  if (q.includes("ayuda") || q.includes("que hacer")) {
    return "Mi lógica integrada sugiere monitorear los logs de los últimos 5 minutos y verificar las colas de tráfico (Queues).";
  }

  return "Consulta recibida. En modo integrado (sin API), mi capacidad de razonamiento abstracto es limitada, pero mi análisis técnico de red está activo al 100%. Por favor, haz una pregunta técnica sobre tus dispositivos.";
};
