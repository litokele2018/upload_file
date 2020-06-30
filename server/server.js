const http = require('http')
const path = require('path')
const fse = require('fs-extra')
const multiparty = require('multiparty')
const SparkMD5 = require('spark-md5')

const UPLOAD_DIR = path.resolve(__dirname, 'target')

let receiveCount = 0
let fileHash = 0

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
    res.status = 200
    res.end()
    return
  }

  if (req.url === '/') {
    // 处理上传
    const multipart = new multiparty.Form()
    multipart.parse(req, async (err, fileds, files) => {
      if (err) throw err
      const [chunk] = files.chunk
      const [hash] = fileds.hash
      const [filename] = fileds.filename
      // 保存文件 前端生成的hash
      fileHash = fileds.fileHash[0]
      const [length] = fileds['length']
      // 保存前端生成切片的个数
      receiveTotalLength = parseInt(length)

      // console.log(fileds)
      const fileDir = path.resolve(UPLOAD_DIR, filename)

      if (!fse.existsSync(fileDir)) {
        await fse.mkdirs(fileDir)
      }
      if (!fse.existsSync(`${fileDir}/${hash}`)) {
        await fse.move(chunk.path, `${fileDir}/${hash}`)
        // 移动完成表示某一次请求的处理完成
        receiveCount++
        res.end(`${receiveCount}`)
      }
    })
  } else if (req.url === '/merge') {
    // 处理合并
    let { filename, size } = await getPostData(req)
    const chunkDir = path.resolve(UPLOAD_DIR, filename)
    let chunksList = fse.readdirSync(chunkDir)
    // 通过排序才能正确的将流 放到正确的位置
    chunksList.sort((a, b) => a.split('-')[2] - b.split('-')[2])
    console.log(chunksList)
    // 将文件计算hash 与 前端传来的hash进行比较 是否相同
    // ............ 如果不同表示发生了丢失
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
    const isComplete = await fileCheck(tempFilePath)
    // 如果前后端文件的hash相同 返回true
    if (isComplete) {
      res.end('ok')
    } else {
      res.end('fail')
    }
  }
})

function fileCheck(tempFilePath) {
  return new Promise(resolve => {
    let file = fse.readFileSync(tempFilePath)
    let spark = new SparkMD5.ArrayBuffer()
    spark.append(file)
    let hash = spark.end()
    console.log(hash)
    console.log(fileHash)
    console.log(hash === fileHash)
    // 如果两个hash相同才return
    resolve(hash === fileHash)
  })
}

server.listen(3000, () => {
  console.log('正在监听端口3000')
})