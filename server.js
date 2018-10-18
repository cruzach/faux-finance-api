const express = require('express');
const bodyParser = require('body-parser');
const knex = require('knex');
var cors = require('cors');
const bcrypt = require('bcrypt-nodejs');

const db = knex({
    client: 'pg',
    connection: {
      connectionString : process.env.DATABASE_URL,
      ssl: true
    }
});



var app = express();


app.use(bodyParser.json());
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
  });

app.get('/', (req, res)=> {
    res.send('this is working quite well');
})

app.post('/signin', (req, res) => {
    const { email, password } = req.body;
    console.log(email,password);
    db('login').select('email','hash').where('email','=',email)
    .then(data => {
        const isValid = bcrypt.compareSync(password, data[0].hash);
        if(isValid){
            return db('users').select('*').where('email','=',email)
            .then(user => {
                res.json(user[0])
            })
            .catch(err => res.status(400).json('unable to retrieve user'))
        } else {
            res.status(400).json('invalid credentials')
        }
    })
    .catch(err => res.status(400).json('Invalid credentials'))
})

app.post('/register', (req, res) => {
    const { email, name, password } = req.body;
    const hash = bcrypt.hashSync(password);
    db.transaction(trx =>{
        trx.insert({
            hash: hash,
            email: email
        }).into('login')
        .returning('email')
        .then(loginEmail => {
            return trx('users')
            .returning('*')
            .insert({
                name:name,
                email: email,
                totalcash: 10000
            }).then(user =>{
                res.json(user[0]);
            })
        })
        .then(trx.commit)
        .catch(trx.rollback)
    })
    .catch(err => res.status(400).json('Unable to register.'))
})

app.post('/trade', (req, res) => {
    const { id, symbol, costPerShare, shareCount, transactionType, cash} = req.body;
    const currentCash = parseFloat(cash);
    const totalCost = (parseFloat(costPerShare)*parseInt(shareCount));
    if(transactionType === 'BUY'){
        console.log(id,transactionType,symbol,shareCount,costPerShare);
        if(currentCash > totalCost){
            db.transaction(trx =>{
                trx.insert({
                    userid: id,
                    buyorsell: transactionType,
                    symbol: symbol,
                    shares: shareCount,
                    costpershare: costPerShare
                }).into('transactions')
                .returning('userid')
                .then(id => {
                    return trx('users')
                    .where('id','=',id[0])
                    .returning('*')
                    .update({
                        totalcash:currentCash-totalCost
                    }).then(user =>{
                        res.json(user[0]);
                    })
                })
                .then(trx.commit)
                .catch(trx.rollback)
            })
            .catch(err => res.status(400).json('Unable to purchase.'))
        } else {
            res.status(400).json('Insufficient funds');
        }
    } else if (transactionType === 'SELL'){
        console.log(id,transactionType,symbol,shareCount,costPerShare, currentCash+totalCost);
        db.transaction(trx =>{
            trx('transactions').where({userid:id,symbol:symbol}).sum('shares').returning('*')
            .then(sumshares => {
                //console.log(sumshares[0].sum);
                //console.log(shareCount);
                if(sumshares[0].sum>=shareCount){
                    return trx.insert({
                        userid: id,
                        buyorsell: transactionType,
                        symbol: symbol,
                        shares: (0-shareCount),
                        costpershare: costPerShare
                    }).into('transactions')
                    .returning('userid')
                    .then(id => {
                        console.log(id);
                        return trx('users')
                        .where('id','=',id[0])
                        .returning('*')
                        .update({
                            totalcash:currentCash+totalCost
                        }).then(user =>{
                            res.json(user[0]);
                        })
                    })
                } else {
                    return res.status(400).json('Insufficient shares.');
                }
            })
            .then(trx.commit)
            .catch(trx.rollback)
        })
        .catch(err => res.status(400).json('Unable to sell.'))
    }
})
    
app.post('/portfolio', (req, res) => {
    const {id} = req.body;
    db('transactions').select('symbol',knex.raw('SUM(shares)'),knex.raw('AVG(costpershare)')).where({userid: id}).groupBy("symbol")
    .then(data => {
        return res.json(data);  
    })
    .catch(err => res.status(400).json('unable to load portfolio'))
})

app.listen(process.env.PORT || 3000, ()=> {
    console.log(`app is running port ${process.env.PORT}`)
})
