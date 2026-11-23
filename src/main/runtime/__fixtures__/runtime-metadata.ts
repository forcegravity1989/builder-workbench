import { writeFileSync } from 'node:fs'
import { getRuntimeMetadataPath, type RuntimeMetadata } from '../../../shared/runtime-bootstrap'

export function plantRuntimeMetadata(userDataPath: string, metadata: RuntimeMetadata): void {
  writeFileSync(getRuntimeMetadataPath(userDataPath), JSON.stringify(metadata))
}
