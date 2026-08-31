import * as THREE from 'three'

type Palette = {
  sky: number
  fog: number
  ground: number
  dirt: number
  light: number
  ambient: number
  sun: number
}

const palettes: Palette[] = [
  {
    sky: 0x4ea6ff,
    fog: 0xa8d4ff,
    ground: 0xb4c78d,
    dirt: 0xd9c4a0,
    light: 0xfff3c8,
    ambient: 0.95,
    sun: 1,
  },
  {
    sky: 0x7b93a8,
    fog: 0x9aafc0,
    ground: 0x8da78f,
    dirt: 0xa8926c,
    light: 0xe6eef5,
    ambient: 0.85,
    sun: 0.25,
  },
  {
    sky: 0x5a6370,
    fog: 0x6e7784,
    ground: 0x788b83,
    dirt: 0x8a7a62,
    light: 0xc7ced6,
    ambient: 0.7,
    sun: 0.04,
  },
  {
    sky: 0x141728,
    fog: 0x1b2040,
    ground: 0x647182,
    dirt: 0x7a746e,
    light: 0xa8b8ff,
    ambient: 0.85,
    sun: 0,
  },
]

function lerpHex(a: number, b: number, t: number) {
  const ca = new THREE.Color(a)
  const cb = new THREE.Color(b)
  return ca.lerp(cb, t)
}

function samplePalette(
  weather: number,
): Palette & { skyC: THREE.Color; fogC: THREE.Color } {
  const max = palettes.length - 1
  const x = THREE.MathUtils.clamp(weather, 0, max)
  const i = Math.floor(x)
  const j = Math.min(i + 1, max)
  const t = x - i
  const A = palettes[i]
  const B = palettes[j]
  return {
    sky: A.sky,
    fog: A.fog,
    ground: A.ground,
    dirt: A.dirt,
    light: A.light,
    ambient: THREE.MathUtils.lerp(A.ambient, B.ambient, t),
    sun: THREE.MathUtils.lerp(A.sun, B.sun, t),
    skyC: lerpHex(A.sky, B.sky, t),
    fogC: lerpHex(A.fog, B.fog, t),
  }
}

function puff(color: number, x: number, y: number, z: number, s: number) {
  const g = new THREE.SphereGeometry(s, 12, 10)
  const m = new THREE.MeshLambertMaterial({
    color,
    transparent: true,
    opacity: 0.92,
  })
  const mesh = new THREE.Mesh(g, m)
  mesh.position.set(x, y, z)
  mesh.scale.set(1.4, 0.7, 1.1)
  return mesh
}

export type WorldHandle = {
  canvas: HTMLCanvasElement
  setWeather: (value: number) => void
  setReducedMotion: (value: boolean) => void
  resize: () => void
  dispose: () => void
}

export function createWorld(canvas: HTMLCanvasElement): WorldHandle {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0xa8d4ff, 18, 40)

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80)
  camera.position.set(5.6, 4.4, 6.8)
  camera.lookAt(0, 0.8, 0)

  const hemi = new THREE.HemisphereLight(0xeaf4ff, 0x3d4a38, 0.9)
  scene.add(hemi)

  const sunLight = new THREE.DirectionalLight(0xfff1c8, 1.6)
  sunLight.position.set(6, 8, 3)
  sunLight.castShadow = true
  sunLight.shadow.mapSize.set(1024, 1024)
  sunLight.shadow.camera.near = 1
  sunLight.shadow.camera.far = 24
  sunLight.shadow.camera.left = -6
  sunLight.shadow.camera.right = 6
  sunLight.shadow.camera.top = 6
  sunLight.shadow.camera.bottom = -6
  sunLight.shadow.normalBias = 0.035
  sunLight.shadow.bias = -0.0005
  sunLight.shadow.radius = 4
  scene.add(sunLight)

  const fill = new THREE.DirectionalLight(0x9bb8ff, 0.25)
  fill.position.set(-4, 3, -2)
  scene.add(fill)

  const stormLight = new THREE.PointLight(0xdce7ff, 0, 18)
  stormLight.position.set(1.2, 5.5, -1)
  scene.add(stormLight)

  const island = new THREE.Group()
  scene.add(island)

  const dirt = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, -0.3),
        new THREE.Vector2(2.3, -0.3),
        new THREE.Vector2(2.52, -0.22),
        new THREE.Vector2(2.6, -0.08),
        new THREE.Vector2(2.6, 0.15),
        new THREE.Vector2(2.5, 0.25),
        new THREE.Vector2(0, 0.25),
      ],
      64,
    ),
    new THREE.MeshStandardMaterial({ color: 0xc4a574, roughness: 0.95 }),
  )
  dirt.position.y = -0.28
  dirt.receiveShadow = true
  dirt.castShadow = true
  island.add(dirt)

  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(2.48, 2.5, 0.16, 64),
    new THREE.MeshStandardMaterial({ color: 0x6fbf78, roughness: 0.88 }),
  )
  ground.position.y = 0.06
  ground.receiveShadow = true
  island.add(ground)

  const path = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.035, 0.35),
    new THREE.MeshStandardMaterial({ color: 0xd9c39a, roughness: 1 }),
  )
  path.position.set(-0.42, 0.15, 0.72)
  path.receiveShadow = true
  island.add(path)
  for (let i = 1; i < 4; i++) {
    const stone = path.clone()
    stone.position.z += i * 0.43
    stone.position.x += Math.sin(i * 0.8) * 0.1
    stone.rotation.y = i * 0.06
    island.add(stone)
  }

  const house = new THREE.Group()
  house.position.set(-0.15, 0.14, -0.15)
  island.add(house)

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xf3efe4,
    roughness: 0.72,
  })
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.05, 1.15), wallMat)
  body.position.y = 0.62
  body.castShadow = true
  body.receiveShadow = true
  house.add(body)

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1.12, 0.72, 4),
    new THREE.MeshStandardMaterial({ color: 0xbc7856, roughness: 0.75 }),
  )
  roof.position.y = 1.48
  roof.rotation.y = Math.PI / 4
  roof.castShadow = true
  house.add(roof)

  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.42, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x8a5a4a, roughness: 0.8 }),
  )
  chimney.position.set(0.38, 1.58, -0.18)
  chimney.castShadow = true
  house.add(chimney)

  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x9bb9ba,
    emissive: 0xffd79a,
    emissiveIntensity: 0.15,
    roughness: 0.2,
  })
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.04), windowMat)
  win.position.set(0.28, 0.68, 0.58)
  house.add(win)
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xfff9e7,
    roughness: 0.8,
  })
  for (const horizontal of [true, false]) {
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(
        horizontal ? 0.38 : 0.04,
        horizontal ? 0.04 : 0.38,
        0.055,
      ),
      trimMat,
    )
    trim.position.copy(win.position)
    trim.position.z += 0.03
    house.add(trim)
  }
  const sideWindow = win.clone()
  sideWindow.rotation.y = Math.PI / 2
  sideWindow.position.set(0.69, 0.7, 0)
  house.add(sideWindow)

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.48, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.7 }),
  )
  door.position.set(-0.28, 0.38, 0.58)
  house.add(door)

  const tree = new THREE.Group()
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.11, 0.7, 8),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1 }),
  )
  trunk.position.set(0, 0.36, 0)
  trunk.castShadow = true
  const leaves = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.58, 2),
    new THREE.MeshStandardMaterial({ color: 0x7e9e60, roughness: 0.85 }),
  )
  leaves.position.set(0, 1.04, 0)
  leaves.scale.set(0.9, 1.3, 0.9)
  leaves.castShadow = true
  tree.add(trunk, leaves)
  tree.position.set(1.35, 0.14, 0.35)
  island.add(tree)
  const littleTree = tree.clone()
  littleTree.position.set(-1.45, 0.14, -0.55)
  littleTree.scale.setScalar(0.72)
  island.add(littleTree)

  // Small garden details keep the island readable without external image assets.
  const bushMat = new THREE.MeshStandardMaterial({
    color: 0x91ac78,
    roughness: 1,
  })
  for (const [x, z, size] of [
    [-1.25, 0.4, 0.3],
    [-1.58, 0.25, 0.23],
    [1.45, -0.8, 0.32],
  ]) {
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 1), bushMat)
    bush.position.set(x, 0.22, z)
    bush.castShadow = true
    island.add(bush)
  }
  const flowerMat = new THREE.MeshStandardMaterial({
    color: 0xf2dc9b,
    roughness: 0.8,
  })
  for (let i = 0; i < 14; i++) {
    const angle = i * 2.4
    const radius = 1.4 + (i % 3) * 0.24
    const flower = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 6, 4),
      flowerMat,
    )
    flower.position.set(Math.cos(angle) * radius, 0.2, Math.sin(angle) * radius)
    island.add(flower)
  }
  for (let i = 0; i < 5; i++) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.42, 0.08),
      trimMat,
    )
    post.position.set(-1.15 + i * 0.47, 0.31, -1.6)
    post.castShadow = true
    island.add(post)
  }
  const fenceRail = new THREE.Mesh(
    new THREE.BoxGeometry(2.02, 0.065, 0.06),
    trimMat,
  )
  fenceRail.position.set(-0.2, 0.42, -1.6)
  island.add(fenceRail)

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.ShadowMaterial({ opacity: 0.09 }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = -0.95
  shadow.receiveShadow = true
  scene.add(shadow)

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff2cc, fog: false }),
  )
  sun.position.set(-1.7, 2.8, -2.1)
  scene.add(sun)

  const clouds = new THREE.Group()
  scene.add(clouds)
  const cloudA = new THREE.Group()
  cloudA.add(puff(0xf4f7fb, -1.6, 3.3, -1.8, 0.55))
  cloudA.add(puff(0xe9eef4, -0.9, 3.45, -1.6, 0.42))
  cloudA.add(puff(0xf7f9fc, -2.1, 3.2, -1.4, 0.36))
  const cloudB = new THREE.Group()
  cloudB.add(puff(0xeff3f8, 2.4, 3.7, -0.6, 0.5))
  cloudB.add(puff(0xe3e9f0, 3.0, 3.85, -0.3, 0.4))
  clouds.add(cloudA, cloudB)

  const rainCount = 900
  const rainGeo = new THREE.BufferGeometry()
  const rainPos = new Float32Array(rainCount * 3)
  for (let i = 0; i < rainCount; i++) {
    rainPos[i * 3] = (Math.random() - 0.5) * 8
    rainPos[i * 3 + 1] = Math.random() * 7
    rainPos[i * 3 + 2] = (Math.random() - 0.5) * 8
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3))
  const rain = new THREE.Points(
    rainGeo,
    new THREE.PointsMaterial({
      color: 0xcfe6ff,
      size: 0.018,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  )
  scene.add(rain)

  const smoke: THREE.Mesh[] = []
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshLambertMaterial({
        color: 0xd9d5cf,
        transparent: true,
        opacity: 0.0,
      }),
    )
    s.userData.t = i / 6
    smoke.push(s)
    scene.add(s)
  }

  let weather = 0
  let reduced = false
  let elapsed = 0
  let raf = 0
  let running = true
  let dirty = true
  let lastTime = performance.now()

  function applyWeather(w: number) {
    dirty = true
    weather = w
    const p = samplePalette(w)
    scene.fog = new THREE.Fog(p.fogC, 18, 40)
    const gi = THREE.MathUtils.clamp(w, 0, 3)
    const i0 = Math.floor(gi)
    const i1 = Math.min(i0 + 1, 3)
    const gt = gi - i0
    ;(ground.material as THREE.MeshStandardMaterial).color.copy(
      lerpHex(palettes[i0].ground, palettes[i1].ground, gt),
    )
    const dirtC = lerpHex(palettes[i0].dirt, palettes[i1].dirt, gt)
    ;(dirt.material as THREE.MeshStandardMaterial).color.copy(dirtC)
    hemi.intensity = p.ambient
    sunLight.intensity = 0.25 + p.sun * 1.5
    sunLight.color.copy(lerpHex(palettes[i0].light, palettes[i1].light, gt))
    sun.material.opacity = p.sun
    ;(sun.material as THREE.MeshBasicMaterial).transparent = true
    sun.visible = p.sun > 0.05
    windowMat.emissiveIntensity = THREE.MathUtils.lerp(0.12, 0.85, w / 3)
    clouds.children.forEach((c, idx) => {
      const show = w > 0.15 + idx * 0.2
      c.visible = show
      c.traverse((obj) => {
        const mat = (obj as THREE.Mesh).material as
          THREE.MeshLambertMaterial | undefined
        if (mat)
          mat.opacity = THREE.MathUtils.clamp(
            (w - idx * 0.15) * 0.9,
            0.15,
            0.95,
          )
      })
    })
    const rainMat = rain.material as THREE.PointsMaterial
    rainMat.opacity = THREE.MathUtils.clamp((w - 1.15) * 0.85, 0, 0.85)
  }

  applyWeather(0)

  function resize() {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w === 0 || h === 0) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    const distance =
      Math.max(7.8 / camera.aspect, 6.7) /
      (2 * Math.tan(THREE.MathUtils.degToRad(18)))
    camera.position.set(5.6, 4.4, 6.8).normalize().multiplyScalar(distance)
    camera.lookAt(0, 0.8, 0)
    camera.updateProjectionMatrix()
    dirty = true
  }

  function tick() {
    if (!running) return
    const now = performance.now()
    const dt = Math.min((now - lastTime) / 1000, 0.05)
    lastTime = now
    if (!reduced) elapsed += dt

    const storm = THREE.MathUtils.clamp((weather - 2) / 1, 0, 1)
    const wind = 0.15 + weather * 0.18

    if (!reduced) {
      island.rotation.y = Math.sin(elapsed * 0.18) * 0.04
      tree.rotation.z = Math.sin(elapsed * 2.1) * 0.04 * (0.4 + wind)
      cloudA.position.x = Math.sin(elapsed * 0.12) * 0.35
      cloudB.position.x = Math.cos(elapsed * 0.1) * 0.45
    }

    if (weather > 1.2 && !reduced) {
      const pos = rain.geometry.attributes.position as THREE.BufferAttribute
      const arr = pos.array as Float32Array
      const speed = 4 + weather * 2.2
      for (let i = 0; i < rainCount; i++) {
        arr[i * 3 + 1] -= speed * dt
        arr[i * 3] -= wind * 1.6 * dt
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3 + 1] = 6.5
          arr[i * 3] = (Math.random() - 0.5) * 8
          arr[i * 3 + 2] = (Math.random() - 0.5) * 8
        }
      }
      pos.needsUpdate = true
    }

    smoke.forEach((s, i) => {
      if (!reduced) s.userData.t = (s.userData.t + dt * 0.22) % 1
      const t = s.userData.t as number
      const origin = chimney.getWorldPosition(new THREE.Vector3())
      s.position.set(
        origin.x + Math.sin(elapsed + i) * 0.12 * wind + t * wind * 0.8,
        origin.y + 0.28 + t * 1.1,
        origin.z + t * 0.1,
      )
      const mat = s.material as THREE.MeshLambertMaterial
      mat.opacity = weather < 2.4 ? (1 - t) * 0.28 : 0
      s.scale.setScalar(0.6 + t * 1.6)
    })

    // A steady cool glow conveys a storm without abrupt flashes.
    stormLight.intensity = storm * 0.7
    if (dirty || !reduced) renderer.render(scene, camera)
    dirty = false
    raf = requestAnimationFrame(tick)
  }

  function onVisibility() {
    cancelAnimationFrame(raf)
    if (!document.hidden) {
      lastTime = performance.now()
      dirty = true
      raf = requestAnimationFrame(tick)
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  resize()
  raf = requestAnimationFrame(tick)

  return {
    canvas,
    setWeather: applyWeather,
    setReducedMotion: (value) => {
      reduced = value
      dirty = true
    },
    resize,
    dispose: () => {
      running = false
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
      renderer.dispose()
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        mesh.geometry?.dispose?.()
        const mat = mesh.material as
          THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat?.dispose?.()
      })
    },
  }
}
