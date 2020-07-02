const http = require('http')
const path = require('path')
const fse = require('fs-extra')
const multiparty = require('multiparty')
const SparkMD5 = require('spark-md5')

const UPLOAD_DIR = path.resolve(__dirname, 'target')

let receiveTotalLength = 0
let receiveCount = 0
const hashStore = [] // 记录上传过文件的hash

const server = http.createServer()

const pipeStream = (path, writeStream) => {
  return new Promise(resolve => {
    const readStream = fse.createReadStream(path)
    readStream.pipe(writeStream)
    readStream.on('end', () => {
      fse.unlinkSync(path)
      resolve()
    })
  })
}

const getPostData = (req) => {
  return new Promise(resolve => {
    let res = ''
    req.on('data', (data) => {
      res += data
    })
    req.on('end', () => {
      resolve(JSON.parse(res))
    })
  })
}

server.on('request', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')

  if (req.method === 'options') {
    res.statusCode = 200
    res.end()
    return
  }

  if (req.url === '/') {
    // 处理上传
    const multipart = new multiparty.Form()
    multipart.parse(req, async (err, fileds, files) => {
      if (err) return
      const [chunk] = files.chunk
      const [hash] = fileds.hash
      const [filename] = fileds.filename
      // 保存文件 前端生成的hash
      let fileHash = fileds.fileHash[0]
      // 文件秒传
      if (hashStore.includes(fileHash)) {
        res.statusCode = 200
        res.end('上传成功')
        return
      }
      const [length] = fileds['length']
      // 保存前端生成切片的个数
      receiveTotalLength = parseInt(length)

      const fileDir = path.resolve(UPLOAD_DIR, filename)

      if (!fse.existsSync(fileDir)) {
        fse.mkdirsSync(fileDir)
      }
      let stat = fse.statSync(fileDir)
      if (stat.isDirectory()) {
        if (!fse.existsSync(`${fileDir}/${hash}`)) {
          await fse.move(chunk.path, `${fileDir}/${hash}`)
          // 移动完成表示某一次请求的处理完成
          receiveCount++
          res.end(`${receiveCount}`)
        }
      } else {
        res.end('已存在')
      }
    })

  } else if (req.url === '/merge') {
    // 处理合并
    let { filename, size, fileHash } = await getPostData(req)
    console.log(fileHash)
    // 如果存在该hash直接返回
    if (hashStore.includes(fileHash) || receiveCount < receiveTotalLength) {
      res.status = 200
      res.end('文件合并成功')
      return
    }
    const chunkDir = path.resolve(UPLOAD_DIR, filename)
    let chunksList = fse.readdirSync(chunkDir)
    // 通过排序才能正确的将流 放到正确的位置
    chunksList.sort((a, b) => a.split('-')[2] - b.split('-')[2])
    console.log(chunksList)
    // 临时地址名 因为 文件夹重复名字了
    const tempFilePath = path.resolve(UPLOAD_DIR, `temp-${filename}`)
    let mergeList = chunksList.map((chunkHash, index) => {
      return pipeStream(
        path.resolve(chunkDir, chunkHash),
        fse.createWriteStream(tempFilePath, {
          start: size * index,
          end: size * (index + 1)
        }))
    })
    await Promise.all(mergeList)
    // 删除文件夹
    await fse.rmdir(chunkDir)
    // 检查hash
    receiveCount = 0

    const isComplete = await fileCheck(tempFilePath, fileHash)
    // 将文件计算hash 与 前端传来的hash进行比较 是否相同
    // 如果前后端文件的hash相同 返回true
    if (isComplete) {
      res.statusCode = 200
      hashStore.push(fileHash)
      fse.renameSync(tempFilePath, path.resolve(tempFilePath, '..', filename))
      res.end('ok')
    } else {
      // 如果不相同先把文件给删了
      res.statusCode = 406
      res.end('fail')
    }
  } else if (req.url === '/verify') {
    let { filename, fileHash } = await getPostData(req)
    if (hashStore.includes(fileHash)) {
      res.end(JSON.stringify([]))
      return
    }
    let filePathOrDir = path.resolve(UPLOAD_DIR, filename)
    if (fse.existsSync(filePathOrDir)) {
      let stat = fse.statSync(filePathOrDir)
      if (stat.isDirectory()) {
        let files = fse.readdirSync(path.resolve(UPLOAD_DIR, filename))
        res.end(JSON.stringify(files))
      }
    }
    res.end(JSON.stringify([]))
  }
})

function fileCheck(tempFilePath, fileHash) {
  return new Promise(resolve => {
    let file = fse.readFileSync(tempFilePath)
    let spark = new SparkMD5.ArrayBuffer()
    spark.append(file)
    let hash = spark.end()
    console.log(hash)
    console.log(fileHash)
    console.log(fileHash === hash)
    // 如果两个hash相同才return
    resolve(hash === fileHash)
  })
}

server.listen(3000, () => {
  console.log('正在监听端口3000')
})