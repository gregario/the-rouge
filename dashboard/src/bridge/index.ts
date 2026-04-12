import { createBridgeServer } from './server'
import { loadConfig } from './config'

const config = loadConfig()
const server = createBridgeServer(config)

server.listen(config.bridgePort, () => {
  console.log(`Rouge bridge server listening on http://localhost:${config.bridgePort}`)
  console.log(`Watching projects in: ${config.projectsRoot}`)
})

process.on('SIGINT', () => {
  console.log('Shutting down bridge server...')
  server.close()
  process.exit(0)
})
