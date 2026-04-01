'use client'

import { useState, useEffect, useRef } from 'react'
import { UserButton } from '@clerk/nextjs'
import Image from 'next/image'
import { useCurrentUser } from '../../lib/useCurrentUser'
import api from '../../lib/api'
import styles from './Dashboard.module.css'

export default function Dashboard() {
  const { clerkId, email, isLoaded } = useCurrentUser()
  const [user, setUser] = useState(null)
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [feedback, setFeedback] = useState([])
  const [newProjectName, setNewProjectName] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const wsRef = useRef(null)
  const [wsStatus, setWsStatus] = useState('disconnected')
  const [summary, setSummary] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)


  useEffect(() => {
    if (!isLoaded || !clerkId) return
    syncUser()
  }, [isLoaded, clerkId])

  // cleanup useEffect 
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  async function syncUser() {
    try {
      const res = await api.post('/users/sync', {
        clerk_id: clerkId,
        email: email,
      })
      setUser(res.data)
      fetchProjects(res.data.id)
    } catch (err) {
      console.error('Error syncing user:', err)
    }
  }

  async function fetchProjects(userId) {
    try {
      const res = await api.get(`/projects/${userId}`)
      setProjects(res.data)
      setLoading(false)
    } catch (err) {
      console.error('Error fetching projects:', err)
      setLoading(false)
    }
  }

  async function createProject() {
    if (!newProjectName.trim()) return
    try {
      const res = await api.post('/projects/', {
        name: newProjectName,
        user_id: user.id,
      })
      setProjects([...projects, res.data])
      setNewProjectName('')
    } catch (err) {
      console.error('Error creating project:', err)
    }
  }

  async function copyEmbedCode(projectId) {
    const code = `<script src="http://localhost:8000/static/widget.js"></script>\n<script>FeedbackPulse.init("${projectId}")</script>`
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  async function fetchFeedback(project) {
    setSelectedProject(project)
    setSummary('')
    try {
      const res = await api.get(`/feedback/${project.id}`)
      setFeedback(res.data)
      connectWebsocket(project.id)
    } catch (err) {
      console.error('Error fetching feedback:', err)
    }
  }

  function connectWebsocket(projectId) {
    if (wsRef.current) {
      wsRef.current.close()
    }

    const ws = new WebSocket(`ws://localhost:8000/feedback/ws/${projectId}`)

    ws.onopen = () => {
      setWsStatus('connected')
      console.log('WebSocket connected for project:', projectId)
    }

    ws.onmessage = (event) => {
      const newFeedback = JSON.parse(event.data)
      setFeedback(prev => [newFeedback, ...prev])
    }

    ws.onclose = () => {
      setWsStatus('disconnected')
    }

    ws.onerror = (err) => {
      console.error('WebSocket error:', err)
      setWsStatus('disconnected')
    }

    wsRef.current = ws
  }

  async function fetchSummary() {
    if (!selectedProject) return
    setSummaryLoading(true)
    setSummary('')

    try {
      const res = await api.get(`/feedback/summary/${selectedProject.id}`)
      setSummary(res.data.summary)
    }
    catch (err) {
      setSummary('Failed to generate summary. Please try again.')
      console.error('Error ferching summary:', err)
    }
    finally {
      setSummaryLoading(false)
    }
  }

  if (!isLoaded || loading) {
    return <div className={styles.loadingState}>Loading...</div>
  }

  return (
    <div className={styles.container}>

      <div className={styles.header}>
        <div className={styles.logoArea}>
          <Image
            src="/FeedbackPulse_Logo.png"
            alt="FeedbackPulse Logo"
            width={36}
            height={36}
            style={{ borderRadius: '8px' }}
          />
          <h1>FeedbackPulse</h1>
        </div>
        <UserButton />
      </div>

      <div className={styles.createSection}>
        <h2>Create a Project</h2>
        <div className={styles.createRow}>
          <input
            type="text"
            placeholder="Project name"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            className={styles.input}
          />
          <button onClick={createProject} className={styles.buttonPrimary}>
            Create
          </button>
        </div>
      </div>

      <div className={styles.grid}>

        <div className={styles.projectsColumn}>
          <h2>Your Projects</h2>
          {projects.length === 0 && (
            <p className={styles.emptyText}>No projects yet. Create one above.</p>
          )}
          {projects.map(project => (
            <div
              key={project.id}
              onClick={() => fetchFeedback(project)}
              className={`${styles.projectCard} ${selectedProject?.id === project.id ? styles.projectCardActive : ''}`}
            >
              <p>{project.name}</p>
            </div>
          ))}
        </div>

        <div className={styles.feedbackColumn}>
          {selectedProject ? (
            <>
              <div className={styles.feedbackHeader}>
                <h2>{selectedProject.name} : Feedback</h2>
                <span className={wsStatus === 'connected' ? styles.statusConnected : styles.statusDisconnected}>
                  {wsStatus === 'connected' ? 'Live' : 'Offline'}
                </span>
              </div>

              <div className={styles.embedBox}>
                <div className={styles.embedHeader}>
                  <p>Embed snippet</p>
                  <button
                    onClick={() => copyEmbedCode(selectedProject.id)}
                    className={styles.copyButton}
                    title="Copy to clipboard"
                  >
                    {copied ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                  </button>
                </div>
                <code className={styles.embedCode}>
                  {`<script src="http://localhost:8000/static/widget.js"></script>`}
                </code>
                <code className={styles.embedCode}>
                  {`<script>FeedbackPulse.init("${selectedProject.id}")</script>`}
                </code>
              </div>

              <div className={styles.summarySection}>
                <button
                  onClick={fetchSummary}
                  disabled={summaryLoading}
                  className={styles.buttonSummary}
                >
                  {summaryLoading ? 'Generating...' : 'Get AI Summary'}
                </button>

                {summary && (
                  <div className={styles.summaryCard}>
                    <p className={styles.summaryLabel}>AI Summary</p>
                    <p className={styles.summaryText}>{summary}</p>
                  </div>
                )}
              </div>

              {feedback.length === 0
                ? <p className={styles.emptyText}>No feedback yet for this project.</p>
                : feedback.map(item => (
                  <div key={item.id} className={styles.feedbackCard}>
                    <p>{item.content}</p>
                    <p className={styles.feedbackMeta}>
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                ))
              }
            </>
          ) : (
            <div className={styles.emptyState}>
              <p>Select a project to view feedback</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}