<template>
  <div>
    <input @change="handleFileChange" type="file" />
    <el-button @click="handleUpload" type="primary">上传</el-button>
    <div>计算hash进度条</div>
    <el-progress :percentage="percentage"></el-progress>
    <el-alert :title="container.hash" type="success" v-if="container.hash.length > 0"></el-alert>
    <div>chunks进度条</div>
    <div :key="index" v-for="(item, index) in data">
      <div>{{item.hash}}</div>
      <el-progress :percentage="item.percentage"></el-progress>
    </div>
  </div>
</template>

<script>
// size
const SIZE = 10 * 1024 * 1024
export default {
  name: 'HelloWorld',
  data() {
    return {
      container: {
        file: '',
        filename: '',
        hash: ''
      },
      data: [],
      percentage: 0
    }
  },
  methods: {
    handleFileChange(e) {
      const [file] = e.target.files
      this.container.file = file
      this.container.filename = file.name
      console.log(file)
    },
    async handleUpload() {
      // 获得切片后的数组
      this.data = this.createFileChunk(this.container.file)
      // 计算hash
      await this.calculateHash(this.data)
      // 重新修改文件属性
      this.data = this.data.map(({ chunk }, index) => {
        return {
          fileHash: this.container.hash,
          chunk,
          hash: this.container.filename + '-' + index,
          percentage: 0
        }
      })
      // 上传切片
      this.uploadChunks()
    },
    async uploadChunks() {
      const requestList = this.data
        .map(({ chunk, hash, fileHash }, index) => {
          const formData = new FormData()
          formData.append('chunk', chunk)
          formData.append('hash', hash)
          formData.append('filename', this.container.filename)
          formData.append('fileHash', fileHash)
          formData.append('length', this.data.length)
          formData.append('index', index)
          return { formData }
        })
        .map(({ formData }, index) =>
          this.request({
            url: 'http://localhost:3000',
            data: formData,
            onProgress: this.createProgressHandler(this.data[index])
          })
        )
      // 上传切片
      let response = await Promise.all(requestList)
      console.log(response)
      // 发送请求合并切片
      this.mergeChunks()
    },
    mergeChunks() {
      this.request({
        url: 'http://localhost:3000/merge',
        data: JSON.stringify({
          filename: this.container.filename,
          size: SIZE
        })
      })
    },
    createFileChunk(file, size = SIZE) {
      let cur = 0
      let fileChunksList = []
      while (cur < file.size) {
        fileChunksList.push({
          chunk: file.slice(cur, cur + size)
        })
        cur += size
      }
      return fileChunksList
    },
    // 计算hash
    calculateHash(fileChunksList) {
      return new Promise(resolve => {
        // 计算hash时， 采用web worker, ES6新出的
        const worker = new Worker('/hash.js')
        worker.postMessage({
          fileChunksList
        })
        worker.onmessage = e => {
          let { percentage, hash } = e.data
          console.log(e.data)
          this.percentage = Math.floor(percentage)
          if (hash) {
            this.container.hash = hash
            resolve(hash)
          }
        }
      })
    },
    request({
      url,
      data,
      method = 'POST',
      onProgress = e => console.log(e),
      headers = {}
    }) {
      return new Promise(resolve => {
        const xhr = new XMLHttpRequest()
        xhr.onprogress = onProgress
        xhr.open(method, url)
        Object.keys(headers).forEach(key => {
          xhr.setRequestHeader(key, headers[key])
        })
        xhr.send(data)
        xhr.onload = e => {
          const response = e.target.response
          resolve(response)
        }
      })
    },
    createProgressHandler(chunk) {
      return function(e) {
        chunk.percentage = Math.floor((e.loaded / e.total) * 100)
      }
    }
  }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
</style>
