'use client'
import dynamic from 'next/dynamic'

const TaskPlanner = dynamic(() => import('../components/TaskPlanner'), { ssr: false })

export default function Page() {
  return <TaskPlanner />
}
