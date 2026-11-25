import { useEffect, useState } from 'react'

/** Object URL of a file for as long as the component lives; revoked on change and unmount. */
export function useObjectUrl(file: Blob | null | undefined): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!file) return
    const created = URL.createObjectURL(file)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with an external resource
    setUrl(created)
    return () => {
      URL.revokeObjectURL(created)
      setUrl(undefined)
    }
  }, [file])
  return url
}
