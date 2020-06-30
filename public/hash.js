self.importScripts('/spark-md5.min.js')

self.onmessage = (e) => {
  let { fileChunksList } = e.data
  const spark = new self.SparkMD5.ArrayBuffer()
  let count = 0
  let percentage = 0
  const loadNext = (count) => {
    // FileReader 读取文件对象的
    const reader = new FileReader()
    reader.readAsArrayBuffer(fileChunksList[count].chunk)
    reader.onload = (e) => {
      count++
      spark.append(e.target.result)
      if (count === fileChunksList.length) {
        self.postMessage({
          percentage: 100,
          hash: spark.end()
        })
        self.close()
      } else {
        percentage += 100 / fileChunksList.length
        self.postMessage({
          percentage
        })
        loadNext(count)
      }
    }
  }
  loadNext(count)
}