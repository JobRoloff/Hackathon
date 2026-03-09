import { NextRequest, NextResponse } from 'next/server'
import { assessRobot } from '../../../lib/maintenance'
import { RobotSnapshot } from '../../../types/robot'

interface AssessRequestBody {
  robotId: string
  snapshots: RobotSnapshot[]
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AssessRequestBody

    if (!body?.robotId || !Array.isArray(body?.snapshots)) {
      return NextResponse.json(
        { error: 'robotId and snapshots (array) are required' },
        { status: 400 },
      )
    }

    const assessment = await assessRobot(body.robotId, body.snapshots)
    return NextResponse.json(assessment, { status: 200 })
  } catch (error) {
    console.error('Error handling /api/assess request', error)
    return NextResponse.json(
      { error: 'Invalid request body or unexpected error' },
      { status: 400 },
    )
  }
}

