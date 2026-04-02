import { useCallback, useEffect, useRef } from 'react'
import { ApiError, api, resolveApiUrl } from '../lib/api'
import { getUrlState, updateUrlState } from '../lib/urlState'
import { debugLog } from '../lib/debug'
import { normalizeServerTree } from '../lib/tree'

function shouldSuppressDesktopConnectionError(error) {
  const message = String(error?.message || '').trim()
  return message === 'Unable to reach the selected server profile.' || message === 'Choose a connected server profile.'
}

export default function useProjectSync({
  captureSessionId,
  clearHistory,
  currentUser,
  onAuthLost,
  pendingLocalEventsRef,
  selectedNode,
  selectedNodeIdRef,
  selectedProjectId,
  treeProjectId,
  setError,
  setMobileConnectionCount,
  setProjectListLoading,
  setProjects,
  setSelectedNodeId,
  setSelectedProjectId,
  setStatus,
  setTree,
}) {
  const projectsRequestSequenceRef = useRef(0)
  const loadingProjectsRequestSequenceRef = useRef(0)
  const treeRequestSequenceRef = useRef(0)
  const currentUserId = currentUser?.id || null
  function buildProjectsSignature(projectList) {
    return JSON.stringify(
      (projectList || []).map((project) => ({
        id: project?.id || '',
        name: project?.name || '',
        node_count: Number(project?.node_count || 0),
        ownerUserId: project?.ownerUserId || '',
        ownerUsername: project?.ownerUsername || '',
      })),
    )
  }

  const loadProjects = useCallback(
    async (preferredProjectId, options = {}) => {
      const silent = Boolean(options?.silent)
      const requestSequence = ++projectsRequestSequenceRef.current
      if (!silent) {
        loadingProjectsRequestSequenceRef.current = requestSequence
        setProjectListLoading?.(true)
      }
      try {
        const projectList = await api('/api/projects')
        if (requestSequence !== projectsRequestSequenceRef.current) {
          debugLog('loadProjects ignored stale response', { preferredProjectId, requestSequence })
          return projectList
        }
        setProjects((current) => {
          const nextProjectsSignature = buildProjectsSignature(projectList)
          const currentProjectsSignature = buildProjectsSignature(current)
          return nextProjectsSignature === currentProjectsSignature ? current : projectList
        })

        if (projectList.length === 0) {
          updateUrlState(null, null, getUrlState().transform)
          setSelectedProjectId(null)
          setTree(null)
          setSelectedNodeId(null)
          setStatus('Create a project to start mapping images.')
          return projectList
        }

        const nextId =
          preferredProjectId && projectList.some((project) => project.id === preferredProjectId)
            ? preferredProjectId
            : projectList[0].id

        debugLog('loadProjects selected project', {
          preferredProjectId,
          nextId,
          projectIds: projectList.map((project) => project.id),
        })
        setSelectedProjectId(nextId)
        setStatus('')
        return projectList
      } finally {
        if (!silent && requestSequence === loadingProjectsRequestSequenceRef.current) {
          setProjectListLoading?.(false)
        }
      }
    },
    [setProjectListLoading, setProjects, setSelectedNodeId, setSelectedProjectId, setStatus, setTree],
  )

  const loadTree = useCallback(
    async (projectId, preferredNodeId) => {
      if (!projectId) {
        return
      }

      const requestSequence = ++treeRequestSequenceRef.current
      const payload = await api(`/api/projects/${projectId}/tree`)
      const nextTree = normalizeServerTree(payload)
      if (requestSequence !== treeRequestSequenceRef.current) {
        debugLog('loadTree ignored stale response', { projectId, preferredNodeId, requestSequence })
        return nextTree
      }
      const resolvedNodeId =
        preferredNodeId && nextTree?.nodes?.some((node) => node.id === preferredNodeId)
          ? preferredNodeId
          : nextTree?.root?.id ?? null
      debugLog('loadTree resolved selection', {
        projectId,
        preferredNodeId,
        resolvedNodeId,
        rootNodeId: nextTree?.root?.id ?? null,
      })
      setTree(nextTree)
      setSelectedNodeId(resolvedNodeId)
    },
    [setSelectedNodeId, setTree],
  )

  useEffect(() => {
    async function initialize() {
      if (!currentUserId) {
        setProjectListLoading?.(false)
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
        if (!shouldSuppressDesktopConnectionError(loadError)) {
          setError(loadError.message)
        }
        setStatus('Unable to load projects.')
      }
    }

    void initialize()
  }, [currentUserId, loadProjects, onAuthLost, setError, setProjectListLoading, setProjects, setSelectedNodeId, setSelectedProjectId, setStatus, setTree])

  useEffect(() => {
    if (!currentUserId) {
      return undefined
    }

    let cancelled = false

    async function refreshProjects() {
      try {
        await loadProjects(selectedProjectId || getUrlState().projectId, { silent: true })
      } catch (loadError) {
        if (loadError instanceof ApiError && loadError.status === 401) {
          onAuthLost?.()
          return
        }
        if (!cancelled && !shouldSuppressDesktopConnectionError(loadError)) {
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
  }, [currentUserId, loadProjects, onAuthLost, selectedProjectId, setError])

  useEffect(() => {
    clearHistory()
  }, [clearHistory, selectedProjectId])

  useEffect(() => {
    if (!currentUserId || !selectedProjectId) {
      return
    }

    const urlState = getUrlState()
    const preferredNodeId = selectedProjectId === urlState.projectId ? urlState.nodeId : null

    loadTree(selectedProjectId, preferredNodeId).catch((loadError) => {
      if (loadError instanceof ApiError && loadError.status === 401) {
        onAuthLost?.()
        return
      }
      if (!shouldSuppressDesktopConnectionError(loadError)) {
        setError(loadError.message)
      }
    })
  }, [currentUserId, loadTree, onAuthLost, selectedProjectId, setError])

  useEffect(() => {
    if (!captureSessionId || !selectedProjectId || !selectedNode?.id || treeProjectId !== selectedProjectId) {
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
        if (!cancelled && !shouldSuppressDesktopConnectionError(publishError)) {
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
  }, [captureSessionId, onAuthLost, selectedNode?.id, selectedProjectId, setError, setMobileConnectionCount, treeProjectId])

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
    if (!currentUserId || selectedProjectId == null) {
      return undefined
    }

    const stream = new EventSource(resolveApiUrl(`/api/projects/${selectedProjectId}/events`))
    stream.onmessage = (event) => {
      const payload = JSON.parse(event.data || '{}')

      if (payload.type === 'connected') {
        debugLog('project event connected', { selectedProjectId })
        return
      }

      if (payload.type === 'project-deleted') {
        loadProjects().catch((loadError) => {
          if (loadError instanceof ApiError && loadError.status === 401) {
            onAuthLost?.()
            return
          }
          if (!shouldSuppressDesktopConnectionError(loadError)) {
            setError(loadError.message)
          }
        })
        return
      }

      if (pendingLocalEventsRef.current > 0) {
        debugLog('project event consumed as local echo', {
          selectedProjectId,
          type: payload.type,
          pendingLocalEvents: pendingLocalEventsRef.current,
        })
        pendingLocalEventsRef.current -= 1
        return
      }

      debugLog('project event triggering tree reload', {
        selectedProjectId,
        type: payload.type,
        preferredNodeId: selectedNodeIdRef.current,
      })
      loadTree(selectedProjectId, selectedNodeIdRef.current).catch((loadError) => {
        if (loadError instanceof ApiError && loadError.status === 401) {
          onAuthLost?.()
          return
        }
        if (!shouldSuppressDesktopConnectionError(loadError)) {
          setError(loadError.message)
        }
      })
    }

    stream.onerror = () => {
      stream.close()
    }

    return () => {
      stream.close()
    }
  }, [currentUserId, loadProjects, loadTree, onAuthLost, pendingLocalEventsRef, selectedNodeIdRef, selectedProjectId, setError])

  return {
    loadProjects,
    loadTree,
  }
}
