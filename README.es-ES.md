

<div align="center">
  <img src="public/logo.png" alt="Logo de Pixcode" width="92" height="92" />
  <h1>Pixcode</h1>
  <p><strong>Plano de control autoalojado para agentes de código IA.</strong></p>
  <p>
    Pixcode te permite ejecutar CLIs de código IA, inspeccionar archivos, gestionar shell y control de versiones,
    orquestar equipos de agentes, automatizar mediante APIs y mantener el trabajo de larga ejecución activo desde
    tu propia computadora o servidor.
  </p>
  <p>
    <a href="https://www.npmjs.com/package/@pixelbyte-software/pixcode"><img src="https://img.shields.io/npm/v/@pixelbyte-software/pixcode?style=for-the-badge&color=10b981" alt="versión npm" /></a>
    <a href="https://github.com/alicomert/pixcode/releases/latest"><img src="https://img.shields.io/github/v/release/alicomert/pixcode?style=for-the-badge&color=0ea5e9" alt="último lanzamiento" /></a>
    <img src="https://img.shields.io/badge/Node.js-22%2B-3c873a?style=for-the-badge" alt="Node.js 22+" />
    <img src="https://img.shields.io/badge/Desktop-Windows%20%7C%20macOS%20%7C%20Linux-6366f1?style=for-the-badge" alt="plataformas de escritorio" />
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="Licencia MIT" /></a>
    <a href="https://github.com/alicomert/pixcode/discussions"><img src="https://img.shields.io/badge/Discussions-open-9ca3af?style=for-the-badge" alt="Discusiones" /></a>
  </p>
  <p>
    <a href="https://buymeacoffee.com/alicomert" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-support%20Pixcode-ffdd00?style=for-the-badge&logo=buymeacoffee&logoColor=000000" alt="Invítame un café" /></a>
  </p>
  <p>
    <a href="https://www.producthunt.com/products/pixcode?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-pixcode" target="_blank" rel="noopener noreferrer"><img alt="Pixcode - A self-hosted control room for AI coding agents. | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1144104&amp;theme=light&amp;t=1778502023682"></a>
  </p>
  <p>
    <a href="https://alicomert.github.io/pixcode/landing.html">Sitio web</a> ·
    <a href="https://github.com/alicomert/pixcode/releases/latest">Lanzamientos</a> ·
    <a href="public/docs.html">Documentación</a> ·
    <a href="public/openapi.yaml">OpenAPI</a> ·
    <a href="CONTRIBUTING.md">Contribuir</a>
  </p>
  <p>
    <a href="README.tr.md">Turkce</a> ·
    <a href="README.de.md">Deutsch</a> ·
    <a href="README.ru.md">Русский</a> ·
    <a href="README.ja.md">日本語</a> ·
    <a href="README.ko.md">한국어</a> ·
    <a href="README.zh-CN.md">简体中文</a>
  </p>
</div>

## Qué hace Pixcode

Pixcode es un espacio de trabajo web y de escritorio local para agentes de código IA. Envuelve los
CLIs que los desarrolladores ya utilizan y añade la capa de control que les falta alrededor:
selección de proyecto, historial de chat, navegación de archivos, acceso a shell, seguimiento de cambios de Git/local,
orquestación, notificaciones, control vía Telegram y automatización por API.

Úsalo cuando una terminal no sea suficiente:

- Quieres tener Claude Code, Cursor CLI, Codex, Gemini CLI, Qwen Code y OpenCode
  disponibles desde la misma pantalla de proyecto.
- Quieres ver la salida del agente, archivos editados, comandos de shell, estado de Git y la
  planificación de tareas sin cambiar de herramienta.
- Quieres un servidor o aplicación de escritorio que mantenga el trabajo en ejecución mientras te conectas
  desde otra computadora, tablet, teléfono o Telegram.
- Quieres una superficie de API real para que otras herramientas puedan crear sesiones, ejecutar agentes,
  inspeccionar proyectos y automatizar flujos de trabajo con claves API `px_`.

Pixcode no es un IDE alojado en la nube. Tu código fuente, sesiones de CLI, credenciales,
rutas de proyecto, configuración MCP, base de datos local y claves de automatización permanecen en la
máquina donde se ejecuta Pixcode, a menos que decidas exponerlas o conectarlas intencionalmente.

## Capturas de pantalla

| Sala de control del espacio de trabajo | Chat móvil |
| --- | --- |
| <img src="public/screenshots/desktop-main.png" alt="Espacio de trabajo de escritorio de Pixcode con chat, controles de proyecto y paneles laterales" width="480" /> | <img src="public/screenshots/mobile-chat.png" alt="Chat móvil de Pixcode" width="260" /> |

| Selección de CLI | Herramientas y MCP |
| --- | --- |
| <img src="public/screenshots/cli-selection.png" alt="Selección de CLI de Pixcode" width="420" /> | <img src="public/screenshots/tools-modal.png" alt="Modal de herramientas y MCP de Pixcode" width="420" /> |

## Características principales

### Espacio de trabajo para agentes multi-CLI

Pixcode otorga a cada CLI de código compatible un espacio de trabajo compartido sin ocultar el
comportamiento nativo del proveedor. Puedes conectar los proveedores que ya utilizas y alternar
entre ellos desde el mismo proyecto.

- Claude Code
- Cursor CLI
- OpenAI Codex
- Gemini CLI
- Qwen Code
- OpenCode

Los paneles del proveedor cubren el estado de autenticación, verificaciones de instalación, versiones de CLI, selección de modelos,
soporte MCP e historial de sesiones. Cuando un agente está pensando, ejecutando herramientas,
esperando aprobación o escribiendo salida, la interfaz mantiene un estado de procesamiento visible
en lugar de dejar la pantalla con una sensación de congelación.

### Chat diseñado para el trabajo de desarrollo

El chat de Pixcode es consciente del proyecto y está diseñado para sesiones de codificación de larga duración.

- Compositor fijo en la parte inferior en pantallas de chat/proyecto.
- Historial de sesiones por proveedor y proyecto.
- Modos por defecto, planificación y ejecución cuando están soportados.
- Entrada amigable con comandos `/`.
- Renderizado de salida de herramientas para planes, operaciones de archivos, salida de comandos y eventos de estado
  del proveedor.
- Notificaciones de Telegram y de navegador/escritorio cuando el trabajo finaliza, falla o necesita
  atención.

### Archivos, shell y control de versiones

Los paneles laterales están construidos alrededor de la forma en que los agentes de código modifican los proyectos.

- Panel de archivos con vistas detalladas y compactas.
- Flujos de apertura/edición de archivos que preservan la superficie principal de chat u orquestación.
- Panel de shell con comportamiento dividido/total en escritorio y comportamiento seguro para móviles en
  pantallas más pequeñas.
- Panel de Control de Versiones para estado de Git, diffs, ramas, commits y archivos cambiados cuando un proyecto es un repositorio Git.
- Seguimiento de cambios local para proyectos que no son repositorios Git.

### Centro de Comandos para archivos modificados

El Centro de Comandos vigila qué cambia mientras los agentes trabajan. Puede rastrear cambios de Git
o cambios en el sistema de archivos local, mostrar la lista de archivos modificados junto al chat activo,
resaltar los elementos cambiados y abrir el archivo editado en la ubicación relevante.

Esto está pensado para responder a la pregunta práctica: "¿Qué acabó de tocar el agente?"

### Orquestación multi-agente

Pixcode puede ejecutar flujos de trabajo estructurados de agentes en lugar de enviar cada indicación a un
solo agente.

Los estilos de flujo de trabajo integrados incluyen:

- Equipo de Agentes: dividir una tarea entre implementación, revisión, documentación, pruebas o
  roles personalizados.
- Traspaso Secuencial: pasar un contexto compacto de una etapa a la siguiente.
- Revisión Multi-modelo: comparar opiniones de proveedores/modelos sobre el mismo código o plan.
- Debate de Decisiones: hacer que múltiples agentes discutan enfoques antes de actuar.

Los controles de orquestación incluyen:

- selección de proveedor y modelo por agente,
- etiquetas, roles e instrucciones personalizadas,
- duplicación de proveedores cuando múltiples trabajadores deben usar el mismo CLI,
- selección de CLI alternativo para pasos fallidos,
- vista previa de ejecución antes de la ejecución,
- salida de pasos en streaming e informe final,
- paneles de configuración/salida redimensionables.

### Orquestación en segundo plano

Pixcode incluye un plano de control de orquestación consciente del proyecto para trabajo de agentes en segundo
plano. Se ejecuta dentro de la instancia actual de Pixcode, comprende el contexto activo
del proyecto y puede enrutar tareas delimitadas a Claude Code, Codex, Cursor,
Gemini, Qwen o OpenCode a través de adaptadores CLI orientados a terminal.

Los controles de orquestación incluyen:

- contexto de tarea con alcance al proyecto,
- enrutamiento por proveedor/modelo,
- estado y artefactos de tarea en streaming,
- coordinación de ejecución de flujos de trabajo,
- verificaciones y vistas previas en segundo plano,
- APIs locales autenticadas bajo `/api/orchestration`.

### Automatización con enfoque en API

El frontend de Pixcode usa el mismo plano de control de backend expuesto a la automatización
externa. Genera una clave API `px_` y llama a las APIs REST/WebSocket desde tus
propias herramientas, scripts, CI, paneles o puente de Telegram.

Listar proyectos:

```bash
curl http://localhost:3001/api/projects \
  -H "Authorization: Bearer px_your_key_here"
```

Ejecutar una tarea de proveedor:

```bash
curl http://localhost:3001/api/agent \
  -H "Authorization: Bearer px_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "codex",
    "projectPath": "/home/me/project",
    "message": "Review the current diff and list risky changes.",
    "stream": false
  }'
```

Vista previa de un flujo de trabajo de orquestación:

```bash
curl http://localhost:3001/api/orchestration/workflows/agent_team/preview \
  -H "Authorization: Bearer px_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "agents": [
        { "adapterId": "codex", "label": "Backend", "role": "backend" },
        { "adapterId": "opencode", "label": "Reviewer", "role": "review" }
      ]
    }
  }'
```

Las claves heredadas `ck_` siguen siendo aceptadas para instalaciones anteriores, pero `px_` es el
prefijo actual.

Referencia OpenAPI: [`public/openapi.yaml`](public/openapi.yaml)

### Telegram, notificaciones y control remoto

Pixcode puede vincular un chat de Telegram con tu cuenta para que las tareas completadas, ejecuciones fallidas
y estados que requieren acción puedan llegar a ti fuera del navegador. El objetivo
no es solo una notificación final: el puente de Telegram es una superficie de control para
indicaciones remotas, selección de proveedor/sesión y trabajo de larga duración.

Las superficies de notificación incluyen:

- alertas dentro de la aplicación,
- notificaciones de navegador/escritorio donde la plataforma lo permita,
- notificaciones de tareas de Telegram,
- avisos de actualización y notas de lanzamiento.

### Sistema de temas

Pixcode cuenta con un sistema de apariencia real en lugar de una única paleta fija azul/marina.

- Modos oscuro y claro.
- Paletas de acento listas para usar, incluidas opciones esmeralda y similares a VS Code.
- Colores de acento personalizados para temas oscuros y claros.
- Estilizado basado en tokens para anillos de enfoque, controles activos, botones, navegación y
  paneles.

### MCP y complementos

Pixcode incluye puntos de extensión para flujos de trabajo locales:

- Gestión de servidores MCP para proveedores compatibles.
- Paneles de autenticación, MCP y sesiones específicos del proveedor.
- Carga de complementos con pestañas de frontend opcionales y servicios de backend.
- Configuración local para claves API, URL base, catálogos de modelos y estado de instalación
  del proveedor.

## Instalación

### Requisitos

- Node.js 22 o posterior.
- Los CLIs de los proveedores que deseas utilizar, instalados y autenticados por separado cuando
  sea necesario.

### Ejecutar con npx

```bash
npx @pixelbyte-software/pixcode
```

Abrir:

```text
http://localhost:3001
```

### Instalación global

```bash
npm install -g @pixelbyte-software/pixcode
pixcode
```

### Instaladores de escritorio

Descarga las compilaciones de escritorio desde los Lanzamientos de GitHub:

- Windows: `.exe`
- macOS: `.dmg`
- Linux: AppImage o paquete de activos, dependiendo del lanzamiento

Lanzamientos: <https://github.com/alicomert/pixcode/releases/latest>

#### Gatekeeper de macOS: "Pixcode está dañado"

Las compilaciones de escritorio actuales de macOS pueden estar sin firmar. Si macOS indica `Pixcode está dañado
y no se puede abrir. Deberías moverlo a la Papelera`, primero asegúrate de que el DMG
provenga de la página oficial de Lanzamientos de GitHub de Pixcode, luego:

1. Abre el DMG y arrastra `Pixcode.app` a `/Applications`.
2. Haz doble clic en `Fix Gatekeeper.command` dentro del DMG montado.
3. Pixcode elimina la bandera de cuarentena de `/Applications/Pixcode.app` y puede
   abrirse normalmente.

Alternativa manual:

```bash
xattr -dr com.apple.quarantine "/Applications/Pixcode.app"
open "/Applications/Pixcode.app"
```

### Demonio en Linux

Para una configuración de servidor o VDS:

```bash
pixcode daemon install --mode auto --port 3001
pixcode daemon status --mode auto
pixcode daemon logs --mode auto
pixcode daemon restart --mode auto
```

Modo primer plano:

```bash
pixcode --no-daemon
```

### Puertos

- Backend instalado y frontend empaquetado: `SERVER_PORT`, por defecto `3001`.
- Desarrollo de frontend únicamente con Vite: `VITE_PORT`, por defecto `5173`.

Para un uso instalado normal, piensa en términos de un solo puerto: `3001`. El puerto `5173` es
solo para desarrollo de frontend con Vite por separado.

## Primera ejecución

1. Abre Pixcode y crea o inicia sesión en la cuenta de usuario local.
2. Agrega las carpetas de proyecto que deseas gestionar.
3. Conecta los proveedores de CLI que realmente utilizas.
4. Abre Configuración y verifica el estado de instalación/autenticación/modelo del proveedor.
5. Usa la orquestación si deseas flujos de trabajo y revisión en segundo plano.
6. Genera una clave API `px_` para automatización externa.
7. Vincula Telegram si deseas indicaciones remotas y notificaciones de finalización.
8. Elige tu paleta de tema en Apariencia.

## Desarrollo

```bash
npm install
npm run typecheck
npm run lint
npm run build
```

Notas importantes de desarrollo:

- `npm run dev` usa el administrador de demonios en Linux.
- Para un ciclo de desarrollo en primer plano, ejecuta `npm run client` y `npm run server`
  por separado, o ejecuta `pixcode --no-daemon`.
- `npm run server` ejecuta la salida compilada desde `dist-server/`; vuelve a compilar después de cambios en el backend.
- Actualmente no hay un conjunto de pruebas unitarias configurado. Usa scripts de prueba rápida, typecheck,
  lint, build y verificaciones manuales de proveedores/API.

## Mapa del repositorio

- `src/` - Frontend React + Vite.
- `server/` - Express, WebSocket, adaptadores CLI, rutas, autenticación, demonio,
  notificaciones.
- `server/modules/orchestration/` - motor de flujos de trabajo multi-agente y adaptadores CLI.
- `server/modules/providers/` - autenticación del proveedor, MCP, sesiones, modelos y puntos finales de instalación.
- `shared/` - contratos compartidos por frontend y backend.
- `public/openapi.yaml` - Referencia de API incluida con la aplicación.
- `public/screenshots/` - Capturas de pantalla del README y del producto.
- `public/llms.txt` y `public/llms-full.txt` - Resúmenes para descubrimiento de IA.

## Listo para código abierto

Pixcode está preparado para contribución pública con los básicos que esperan los colaboradores:

- README claro con propósito, comandos de instalación, capturas de pantalla, ejemplos de API y
  mapa de arquitectura.
- Licencia MIT — ver [`LICENSE`](LICENSE). Libre para uso comercial y personal.
- Guía de contribución en [`CONTRIBUTING.md`](CONTRIBUTING.md).
- Código de conducta en [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
- Política de seguridad en [`SECURITY.md`](SECURITY.md).
- Plantillas de incidencias de GitHub para informes de errores, solicitudes de características y buenos primeros
  pasos.
- Lanzamientos y etiquetas de versión publicadas a través de Lanzamientos de GitHub.
- Sitio web estático y documentación bajo [`public/`](public).

El buen trabajo inicial debe estar etiquetado como `good first issue` en GitHub. El repositorio
también incluye una plantilla de good-first-issue para que tareas pequeñas y delimitadas puedan registrarse
sin perder contexto.

## Modelo de seguridad

- Pixcode es autoalojado. Trátalo como un plano de control local para tu máquina.
- Usa credenciales de cuenta local robustas al exponerlo en una red.
- Coloca despliegues de servidor público detrás de un proxy inverso de confianza, VPN o firewall.
- Las claves API están diseñadas para automatización. Rótalas si quedan expuestas.
- Los secretos del proveedor están enmascarados en las respuestas de APIs y UI donde sea posible.
- No publiques registros que contengan tokens del proveedor, salida de sesión o rutas
  de proyecto privadas.

## Contribuir

Lee [`CONTRIBUTING.md`](CONTRIBUTING.md) antes de abrir una solicitud de extracción. Mantén
los cambios delimitados, ejecuta los comandos de verificación anteriores e incluye capturas de pantalla o
grabaciones cortas para trabajo de UI cuando sea posible.

Para expectativas de comportamiento comunitario, lee
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Para informes privados de vulnerabilidades,
lee [`SECURITY.md`](SECURITY.md).

## Nube (Próximamente)

Pixcode Cloud ofrecerá una experiencia SaaS totalmente gestionada: sin configuración de servidor,
sin Docker, sin configuración de demonio. Conecta tus repos de GitHub, elige un
agente de código IA y déjalo trabajar en un contenedor aislado que gestionamos por ti.

- **BYOK** (Trae Tu Propia Clave) o usa nuestro pool de API gestionado
- Contenedores Docker aislados por proyecto
- Colaboración en equipo y espacios de trabajo compartidos
- Análisis de costos y paneles de uso de tokens
- Mercado de flujos de trabajo con plantillas de orquestación preconstruidas

Únete a la discusión o solicita acceso anticipado en
[Discusiones de GitHub](https://github.com/alicomert/pixcode/discussions).

## Enlaces

- Sitio web: <https://alicomert.github.io/pixcode/landing.html>
- npm: <https://www.npmjs.com/package/@pixelbyte-software/pixcode>
- GitHub: <https://github.com/alicomert/pixcode>
- Lanzamientos: <https://github.com/alicomert/pixcode/releases/latest>
- Docs de API: [`public/openapi.yaml`](public/openapi.yaml)
- Docs estáticos: [`public/docs.html`](public/docs.html), [`public/features.html`](public/features.html), [`public/orchestration.html`](public/orchestration.html), [`public/api-automation.html`](public/api-automation.html)
- Descubrimiento IA: [`public/llms.txt`](public/llms.txt), [`public/llms-full.txt`](public/llms-full.txt)

Pixcode es un proyecto de código abierto independiente y no está afiliado con OpenAI,
Anthropic, Google, Cursor, Alibaba/Qwen u OpenCode.
