import { useEffect, useRef, useState } from 'react'
import { createWorld, type WorldHandle } from './createWorld'

export default function WeatherWorld({
  weather,
  paused,
}: {
  weather: number
  paused: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const worldRef = useRef<WorldHandle | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let world: WorldHandle
    try {
      world = createWorld(canvas)
    } catch {
      // WebGL initialization is an external capability check, not derived render state.
      // eslint-disable-next-line react/set-state-in-effect
      setUnavailable(true)
      return
    }
    worldRef.current = world
    const onResize = () => world.resize()
    const observer = new ResizeObserver(onResize)
    observer.observe(canvas)
    const onContextLost = (event: Event) => {
      event.preventDefault()
      setUnavailable(true)
    }
    canvas.addEventListener('webglcontextlost', onContextLost)
    world.resize()
    return () => {
      observer.disconnect()
      canvas.removeEventListener('webglcontextlost', onContextLost)
      world.dispose()
      worldRef.current = null
    }
  }, [])

  useEffect(() => {
    worldRef.current?.setWeather(weather)
  }, [weather])

  useEffect(() => {
    worldRef.current?.setReducedMotion(paused)
  }, [paused])

  return (
    <>
      <canvas
        className="world"
        ref={canvasRef}
        aria-hidden="true"
        hidden={unavailable}
      />
      {unavailable && (
        <div className="world-loading">小岛休息中，心情仍在这里。</div>
      )}
    </>
  )
}
