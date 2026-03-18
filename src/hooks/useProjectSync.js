import { useCallback, useEffect, useRef } from 'react'
import { ApiError, api } from '../lib/api'
import { getUrlState, updateUrlState } from '../lib/urlState'

export default function useProjectSync({
  captureSessionId,
  clearHistory,
  currentUser,
  onAuthLost,
  pendingLocalEventsRef,
  selectedNode,
  selectedNodeIdRef,
  selectedProjectId,
  setError,
  setMobileConnectionCount,
  setProjects,
  setSelectedNodeId,
  setSelectedProjectId,
  setStatus,
  setTree,
}) {
  const projectsRequestSequenceRef = useRef(0)
  const treeRequestSequenceRef = useRef(0)

  const loadProjects = useCallback(
    async (preferredProjectId) => {
      const requestSequence = ++projectsRequestSequenceRef.current
      const projectList = await api('/api/projects')
      if (requestSequence !== projectsRequestSequenceRef.current) {
        return projectList
      }
      setProjects(projectList)

      if (projectList.length === 0) {
        updateUrlState(null, null, getUrlState().transform)
        setSelectedProjectId(null)
        setTree(null)
        setSelectedNodeId(null)
        setStatus('Create a project to start mapping images.')
        return
      }

      const nextId =
        preferredProjectId && projectList.some((project) => project.id === preferredProjectId)
          ? preferredProjectId
          : projectList[0].id

      setSelectedProjectId(nextId)
      setStatus('')
    },
    [setProjects, setSelectedNodeId, setSelectedProjectId, setStatus, setTree],
  )

  const loadTree = useCallback(
    async (projectId, preferredNodeId) => {
      if (!projectId) {
        return
      }

      const requestSequence = ++treeRequestSequenceRef.current
      const payload = await api(`/api/projects/${projectId}/tree`)
      if (requestSequence !== treeRequestSequenceRef.current) {
        return payload
      }
      setTree(payload)
      setSelectedNodeId(
        preferredNodeId && payload.nodes.some((node) => node.id === preferredNodeId)
          ? preferredNodeId
          : payload.root?.id ?? null,
      )
    },
    [setSelectedNodeId, setTree],
  )

  useEffect(() => {
    async function initialize() {
      if (!currentUser) {
        setProjects([])
        setSelectedProjectId(null)
        setTree(null)
        setSelectedNodeId(null)
        return
      }

      try {
        await loadProjects(getUrlState().projectId)
      } catch (loadError) {
        if (loadError instanceof ApiError && loadError.status === 401) {
          onAuthLost?.()
          return
        }
        setError(loadError.message)
        setStatus('Unable to load projects.')
      }
    }

    void initialize()
  }, [currentUser, loadProjects, onAuthLost, setError, setProjects, setSelectedNodeId, setSelectedProjectId, setStatus, setTree])

  useEffect(() => {
    if (!currentUser) {
      return undefined
    }

    let cancelled = false

    async function refreshProjects() {
      try {
        await loadProjects(selectedProjectId || getUrlState().projectId)
      } catch (loadError) {
        if (loadError instanceof ApiError && loadError.status === 401) {
          onAuthLost?.()
          return
        }
        if (!cancelled) {
          setError(loadError.message)
        }
      }
    }

    const handle = window.setInterval(() => {
      void refreshProjects()
    }, 5000)

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void refreshProjects()
      }
    }

    window.addEventListener('focus', refreshProjects)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      window.clearInterval(handle)
      window.removeEventListener('focus', refreshProjects)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [currentUser, loadProjects, onAuthLost, selectedProjectId, setError])

  useEffect(() => {
    clearHistory()
  }, [clearHistory, selectedProjectId])

  useEffect(() => {
    if (!currentUser || !selectedProjectId) {
      return
    }

    const urlState = getUrlState()
    const preferredNodeId = selectedProjectId === urlState.projectId ? urlState.nodeId : null

    loadTree(selectedProjectId, preferredNodeId).catch((loadError) => {
      if (loadError instanceof ApiError && loadError.status === 401) {
        onAuthLost?.()
        return
      }
      setError(loadError.message)
    })
  }, [currentUser, loadTree, onAuthLost, selectedProjectId, setError])

  useEffect(() => {
    if (!captureSessionId || !selectedProjectId || !selectedNode?.id) {
      return undefined
    }

    let cancelled = false

    async function publishSelection() {
      try {
        const payload = await api(`/api/sessions/${captureSessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: selectedProjectId,
            selectedNodeId: selectedNode.id,
          }),
        })
        if (!cancelled) {
          setMobileConnectionCount(payload.connectionCount || 0)
        }
      } catch (publishError) {
        if (publishError instanceof ApiError && publishError.status === 401) {
          onAuthLost?.()
          return
        }
        if (!cancelled) {
          setError(publishError.message)
        }
      }
    }

    void publishSelection()
    const heartbeat = window.setInterval(publishSelection, 15000)

    return () => {
      cancelled = true
      window.clearInterval(heartbeat)
    }
  }, [captureSessionId, onAuthLost, selectedNode?.id, selectedProjectId, setError, setMobileConnectionCount])

  useEffect(() => {
    if (!captureSessionId || !selectedProjectId) {
      setMobileConnectionCount(0)
      return undefined
    }

    let cancelled = false

    async function refreshSessionConnections() {
      try {
        const payload = await api(`/api/sessions/${captureSessionId}`)
        if (payload?.ok === false) {
          if (!cancelled) {
            setMobileConnectionCount(0)
          }
          return
        }
        if (!cancelled) {
          setMobileConnectionCount(payload.connectionCount || 0)
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          onAuthLost?.()
          return
        }
        if (!cancelled) {
          setMobileConnectionCount(0)
        }
      }
    }

    void refreshSessionConnections()
    const handle = window.setInterval(refreshSessionConnections, 5000)

    return () => {
      cancelled = true
      window.clearInterval(handle)
    }
  }, [captureSessionId, onAuthLost, selectedProjectId, setMobileConnectionCount])

  useEffect(() => {
    if (!currentUser || selectedProjectId == null) {
      return undefined
    }

    const stream = new EventSource(`/api/projects/${selectedProjectId}/events`)
    stream.onmessage = (event) => {
      const payload = JSON.parse(event.data || '{}')

      if (payload.type === 'connected') {
        return
      }

      if (payload.type === 'project-deleted') {
        loadProjects().catch((loadError) => {
          if (loadError instanceof ApiError && loadError.status === 401) {
            onAuthLost?.()
            return
          }
          setError(loadError.message)
        })
        return
      }

      if (pendingLocalEventsRef.current > 0) {
        pendingLocalEventsRef.current -= 1
        return
      }

      loadTree(selectedProjectId, selectedNodeIdRef.current).catch((loadError) => {
        if (loadError instanceof ApiError && loadError.status === 401) {
          onAuthLost?.()
          return
        }
        setError(loadError.message)
      })
    }

    stream.onerror = () => {
      stream.close()
    }

    return () => {
      stream.close()
    }
  }, [currentUser, loadProjects, loadTree, onAuthLost, pendingLocalEventsRef, selectedNodeIdRef, selectedProjectId, setError])

  return {
    loadProjects,
    loadTree,
  }
}
