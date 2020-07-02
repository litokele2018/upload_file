<template>
  <div>
    <input @change="handleFileChange" type="file" />
    <el-button :disabled="upload" @click="handleUpload" type="primary">上传</el-button>
    <el-button :disabled="pause" @click="handlePause" type="warning">暂停</el-button>
    <el-button :disabled="con" @click="handleContinue" type="success">继续</el-button>
    <div>计算hash进度条</div>
    <el-progress :percentage="percentage"></el-progress>
    <el-alert :title="container.hash" type="success" v-if="container.hash.length > 0"></el-alert>
    <div v-if="container.hash.length > 0">
      chunks进度条
      <div :key="index" v-for="(item, index) in data">
        <div>{{item.hash}}</div>
        <el-progress :percentage="item.percentage"></el-progress>
      </div>
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
      // hash 计算的百分比
      percentage: 0,
      requestList: [],
      upload: false,
      pause: true,
      con: true,
      xhrs: []
    }
  },
  methods: {
    handleFileChange(e) {
      const [file] = e.target.files
      this.container.file = file
      this.container.filename = file.name
      console.log(file)
    },
    // 上传按钮
    async handleUpload() {
      if (!this.container.file) return
      this.upload = true
      this.pause = false
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
      this.uploadChunks()
    },
    // 暂停按钮
    handlePause() {
      if (!this.xhrs.length || !this.container.hash) return
      this.pause = true
      this.con = false
      this.xhrs.forEach(item => {
        item.abort()
      })
    },
    // 继续
    handleContinue() {
      this.pause = false
      this.con = true
      this.uploadChunks()
    },
    // 上传切片
    async uploadChunks() {
      let verifyRes = await this.request({
        url: 'http://localhost:3000/verify',
        data: JSON.stringify({
          filename: this.container.filename,
          fileHash: this.container.hash
        })
      })
      const uploadedList = JSON.parse(verifyRes.response)
      console.log(uploadedList)
      this.requestList = this.data
        .filter(({ hash }) => !uploadedList.includes(hash))
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
            onProgress: this.createProgressHandler(this.data[index]),
            xhrs: this.xhrs
          })
        )
      // console.log(this.xhrs) // xhr 数组
      // console.log(this.requestList) // promise 数组
      // 上传切片
      let response = await Promise.all(this.requestList)
      console.log(response)
      // 发送请求合并切片
      const res = await this.mergeChunks()
      if (res.status !== 200) {
        this.uploadChunks()
      } else {
        this.upload = false
        this.con = true
        this.pause = true
        this.$message.success('上传成功')
      }
    },
    // 合并切片
    mergeChunks() {
      return this.request({
        url: 'http://localhost:3000/merge',
        data: JSON.stringify({
          filename: this.container.filename,
          size: SIZE,
          fileHash: this.container.hash
        })
      })
    },
    // 生成切片
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
        if (this.container.hash) {
          resolve(this.container.hash)
          return
        }
        // 计算hash时， 采用web worker, ES6新出的
        const worker = new Worker('/hash.js')
        worker.postMessage({
          fileChunksList
        })
        worker.onmessage = e => {
          let { percentage, hash } = e.data
          // 修改hash计算的百分比
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
      onProgress = e => e,
      headers = {},
      xhrs = []
    }) {
      return new Promise(resolve => {
        const xhr = new XMLHttpRequest()
        // 放入xhr
        xhrs.push(xhr)
        xhr.onprogress = onProgress
        xhr.open(method, url)
        Object.keys(headers).forEach(key => {
          xhr.setRequestHeader(key, headers[key])
        })
        xhr.send(data)
        xhr.onload = e => {
          let index = xhrs.indexOf(xhr)
          xhrs.splice(index, 1)
          resolve(e.target)
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
