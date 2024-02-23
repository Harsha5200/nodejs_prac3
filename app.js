const express = require('express')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')

let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()

const convertDbObjectToResponseObject = dbObject => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  }
}

const convertDbObjectToResponseObjectOfDistrict = dbObject => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  }
}

const authenticateToken = (request, response, next) => {
  let jwt_Token
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwt_Token = authHeader.split(' ')[1]
  }
  if (jwt_Token === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwt_Token, 'THE_SECRET_KEY', async (error, user) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        next()
      }
    })
  }
}

app.post('/login/', async (request, response) => {
  const loginDetails = request.body
  const {username, password} = loginDetails
  const verifyLoginQuery = `
    SELECT
        *
    FROM
        user
    WHERE
      username = '${username}'`

  const dbUser = await db.get(verifyLoginQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched === true) {
      const payload = {username: username}
      const jwt_Token = jwt.sign(payload, 'THE_SECRET_KEY')
      response.send({jwt_Token})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//Returns a list of all states in the state table
app.get('/states/', authenticateToken, async (request, response) => {
  const getStateQuery = `
    SELECT
      *
    FROM
      state;`
  const stateArray = await db.all(getStateQuery)
  response.send(
    stateArray.map(eachState => convertDbObjectToResponseObject(eachState)),
  )
})

//Returns a state based on the state ID
app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params
  const getStateQuery = `
    SELECT
      *
    FROM
      state
    WHERE
      state_id = ${stateId};`
  const state = await db.get(getStateQuery)
  response.send(convertDbObjectToResponseObject(state))
})

//Create a district in the district table, district_id is auto-incremented
app.post('/districts/', authenticateToken, async (request, response) => {
  const districtDetails = request.body
  const {districtName, stateId, cases, cured, active, deaths} = districtDetails
  const addDistrictQuery = `
    INSERT INTO
      district (district_name, state_id, cases, cured, active, deaths)
    VALUES
      (
        '${districtName}',
         ${stateId},
         ${cases},
         ${cured},
         ${active},
         ${deaths}
      );`

  const dbResponse = await db.run(addDistrictQuery)
  const districtId = dbResponse.lastID
  response.send('District Successfully Added')
})

//Returns a district based on the district ID
app.get(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrictQuery = `
    SELECT
      *
    FROM
      district
    WHERE
      district_id = ${districtId};`
    const districtArray = await db.all(getDistrictQuery)
    response.send(
      districtArray.map(eachDistrict =>
        convertDbObjectToResponseObjectOfDistrict(eachDistrict),
      ),
    )
  },
)
//Deletes a district from the district table based on the district ID
app.delete(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const deleteDistrictQuery = `
    DELETE FROM
      district
    WHERE
      district_id = ${districtId};`
    await db.run(deleteDistrictQuery)
    response.send('District Removed')
  },
)

//Updates the details of a specific district based on the district ID
app.put(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const districtDetails = request.body
    const {districtName, stateId, cases, cured, active, deaths} =
      districtDetails
    const updateDistrictQuery = `
    UPDATE
      district
    SET
      district_name='${districtName}',
      state_id=${stateId},
      cases=${cases},
      cured=${cured},
      active=${active},
      deaths=${deaths}
    WHERE
      district_id = ${districtId};`
    await db.run(updateDistrictQuery)
    response.send('District Details Updated')
  },
)

//Returns the statistics of total cases, cured, active, deaths of a specific state based on state ID
app.get(
  '/states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params
    const getStatisticsQuery = `
    SELECT
      SUM(cases), 
      SUM(cured),
      SUM(active),
      SUM(deaths)        
    FROM
      district
    WHERE
      state_id = ${stateId};`
    const statistics = await db.get(getStatisticsQuery)
    response.send({
      totalCases: statistics['SUM(cases)'],
      totalCured: statistics['SUM(cured)'],
      totalActive: statistics['SUM(active)'],
      totalDeaths: statistics['SUM(deaths)'],
    })
  },
)

module.exports = app
