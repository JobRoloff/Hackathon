import OpenAI from 'openai'
import type { Anomaly, RobotSnapshot } from '../types/robot'
import { predictOutcome } from './maintenance'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

export interface ActionStepRecommendation {
  /** Ordered list of recommended action steps for maintenance/operators. */
  steps: string[]
  /** Optional short summary from the model. */
  summary?: string
}

const SYSTEM_PROMPT_BASE = `You are an expert maintenance advisor for industrial collaborative robots. You advise on a FANUC CR-7iA/L collaborative robot arm.

Context:
- Device: FANUC CR-7iA/L collaborative robot arm
- Application: Short motion cycles for pick-and-place of test-tube-sized parts
- You will receive a detected anomaly (sensor, severity, message). Recommend clear, actionable steps for operators or maintenance to address this issue. Be specific to this robot type and pick-and-place application (e.g. gripper, joints, tool current, safety stops). Keep steps concise and actionable. your response should not contain any formatting such as *`

async function getPredictionContext(snapshot: RobotSnapshot): Promise<string> {
  try {
    const result = await predictOutcome(snapshot)
    if (!result) return ''
    const lines: string[] = [
      '',
      'Prediction model outcome (from current robot snapshot):',
      `- Overall: ${result.predictedOutcome}, risk score: ${result.riskScore}`,
      `- Joints exceeding current limit: ${result.jointsExceedingCurrent.length ? result.jointsExceedingCurrent.join(', ') : 'none'}`,
      `- Joints exceeding temperature limit: ${result.jointsExceedingTemperature.length ? result.jointsExceedingTemperature.join(', ') : 'none'}`,
    ]
    if (result.jointsOfConcern?.length) {
      lines.push(`- Joints of concern (near limits): ${result.jointsOfConcern.join(', ')}`)
    }
    if (result.joints.length > 0) {
      lines.push('Per-joint status:')
      result.joints.forEach((j) => {
        lines.push(`  Joint ${j.jointId}: current ${j.currentA}A (${j.currentStatus}), temp ${j.temperatureC}°C (${j.temperatureStatus})`)
      })
    }
    return lines.join('\n')
  } catch {
    return ''
  }
}

/**
 * Uses an LLM (OpenAI) to recommend action steps for a single anomaly
 * from the FANUC CR-7iA/L robot. Requires OPENAI_API_KEY in the root .env.
 * When snapshot is provided, calls the predict outcome API and includes that
 * data in the prompt for more relevant recommendations.
 */
export async function recommendActionSteps(
  anomaly: Anomaly,
  options?: { model?: string; snapshot?: RobotSnapshot }
): Promise<ActionStepRecommendation | null> {
  if (!OPENAI_API_KEY?.trim()) {
    console.warn('OPENAI_API_KEY is not set in .env; skipping LLM recommendation.')
    return null
  }

  const client = new OpenAI({ apiKey: OPENAI_API_KEY })
  const model = options?.model ?? 'gpt-4o-mini'

  const anomalyLine = `- [${anomaly.severity}] ${anomaly.sensor}${anomaly.jointId != null ? ` (joint ${anomaly.jointId})` : ''}: ${anomaly.message}`

  const userContent = `Detected anomaly:\n${anomalyLine}\n\nProvide recommended action steps as a numbered list. Optionally add a one-line summary at the end.`

  const predictionContext = options?.snapshot
    ? await getPredictionContext(options.snapshot)
    : ''
  const systemContent = SYSTEM_PROMPT_BASE + predictionContext

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
    })

    const content = completion.choices[0]?.message?.content?.trim()
    if (!content) return null

    const steps = parseNumberedSteps(content)
    const summary = steps.length > 0 ? undefined : content
    return {
      steps: steps.length > 0 ? steps : [content],
      summary,
    }
  } catch (err) {
    console.error('OpenAI recommendation failed:', err)
    return null
  }
}

function parseNumberedSteps(text: string): string[] {
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean)
  const steps: string[] = []
  for (const line of lines) {
    const match = line.match(/^\d+[.)]\s*(.+)$/)
    if (match) steps.push(match[1].trim())
  }
  return steps
}
