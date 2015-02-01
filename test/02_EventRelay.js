"use strict";

var env = require('../lib/env');
var Spec = require('../lib/Spec');
var Host = require('../lib/Host');
var Model = require('../lib/Model');
var SyncSet = require('../lib/Set');
var Storage = require('../lib/Storage');

env.multihost = true;
env.debug = true;

MetricLengthField.metricRe = /(\d+)(mm|cm|m|km)?/g;  // "1m and 10cm"
MetricLengthField.scale = { m:1, cm:0.01, mm:0.001, km:1000 };
MetricLengthField.scaleArray = ['km','m','cm','mm'];

function MetricLengthField (value) {
    // convert mm cm m km
    if (typeof(value)==='number') {
        this.meters = value;
    } else {
        value = value.toString();
        this.meters=0;
        var m=[], scale=MetricLengthField.scale;
        MetricLengthField.metricRe.lastIndex = 0;
        while (m=MetricLengthField.metricRe.exec(value)) {
            var unit = m[2] ? scale[m[2]] : 1;
            this.meters += parseInt(m[1]) * unit;
        }
    }
}
MetricLengthField.prototype.add = function () {

};
// .pojo() invokes (entry.toJSON&&entry.toJSON()) || entry.toString()
MetricLengthField.prototype.toString = function () {
    var m = this.meters, ret='', scar = MetricLengthField.scaleArray;
    for(var i=0; i<scar.length; i++) {
        var unit = scar[i],
            scale= MetricLengthField.scale[unit];
        var wholeUnits = Math.floor(m/scale);
        if (wholeUnits>=1) {
            ret += wholeUnits + unit;
        }
        m -= wholeUnits*scale;
    }
    return ret;
};


// Duck is our core testing class :)
var Duck = Model.extend('Duck',{
    defaults: {
        age: 0,
        height: {type:MetricLengthField,value:'3cm'},
        mood: 'neutral'
    },
    // Simply a regular convenience method
    canDrink: function () {
        return this.age >= 18; // Russia
    },
    validate: function (spec,val) {
        return ''; // :|
        //return spec.op()!=='set' || !('height' in val);
        //throw new Error("can't set height, may only grow");
    },
    $$grow: function (spec,by,src) {
        this.height = this.height.add(by);
    }
});

var Nest = SyncSet.extend('Nest',{
    entryType: Duck
});

var storage2 = new Storage(false);
var host2 = env.localhost= new Host('gritzko',0,storage2);

asyncTest('2.a basic listener func', function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost= host2;
    expect(5);
    // construct an object with an id provided; it will try to fetch
    // previously saved state for the id (which is none)
    var huey = host2.get('/Duck#hueyA');
    //ok(!huey._version); //storage is a?sync
    // listen to a field
    huey.on('age',function lsfn2a (spec,val){  // FIXME: filtered .set listener!!!
        equal(val.age,1);
        equal(spec.op(),'set');
        equal(spec.toString(),'/Duck#hueyA!'+spec.version()+'.set');
        var version = spec.token('!');
        equal(version.ext,'gritzko');
        huey.off('age',lsfn2a);
        equal(huey._lstn.length,2); // only the uplink remains (and the comma)
        start();
    });
    huey.onStateReady(function init2a () {
        huey.set({age:1});
    });
});

test('2.b create-by-id', function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost= host2;
    // there is 1:1 spec-to-object correspondence;
    // an attempt of creating a second copy of a model object
    // will throw an exception
    var dewey1 = new Duck('dewey');
    // that's we resort to descendant() doing find-or-create
    var dewey2 = host2.get('/Duck#dewey');
    // must be the same object
    strictEqual(dewey1,dewey2);
    equal(dewey1.spec().type(),'Duck');
});


test('2.c version ids', function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost= host2;
    var louie = new Duck('louie');
    var ts1 = host2.time();
    louie.set({age:3});
    var ts2 = host2.time();
    ok(ts2>ts1);
    var vid = louie._version.substr(1);
    ok(ts1<vid);
    ok(ts2>vid);
    console.log(ts1,vid,ts2);
});

test('2.d pojos',function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost= host2;
    var dewey = new Duck({age:0});
    var json = dewey.pojo();
    var duckJSON = {
        mood: "neutral",
        age: 0,
        height: '3cm'
    };
    deepEqual(json,duckJSON);
});

asyncTest('2.e reactions',function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost= host2;
    var huey = host2.get('/Duck#huey');
    expect(2);
    var handle = Duck.addReaction('age', function reactionFn(spec,val) {
        console.log('yupee im growing');
        equal(val.age,1);
        start();
    });
    //var version = host2.time(), sp = '!'+version+'.set';
    huey.deliver(huey.newEventSpec('set'), {age:1});
    Duck.removeReaction(handle);
    equal(Duck.prototype._reactions['set'].length,0); // no house cleaning :)
});

// TODO $$event listener/reaction (Model.on: 'key' > .set && key check)

test('2.f once',function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost= host2;
    var huey = host2.get('/Duck#huey');
    expect(1);
    huey.once('age',function onceAgeCb(spec,value){
        equal(value.age,4);
    });
    huey.set({age:4});
    huey.set({age:5});
});

test('2.g custom field type',function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost= host2;
    var huey = host2.get('/Duck#huey');
    huey.set({height:'32cm'});
    ok(Math.abs(huey.height.meters-0.32)<0.0001);
    var vid = host2.time();
    host2.deliver(new Spec('/Duck#huey!'+vid+'.set'),{height:'35cm'});
    ok(Math.abs(huey.height.meters-0.35)<0.0001);
});

test('2.h state init',function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost= host2;
    var factoryBorn = new Duck({age:0,height:'4cm'});
    ok(Math.abs(factoryBorn.height.meters-0.04)<0.0001);
    equal(factoryBorn.age,0);
});

test('2.i batched set',function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost= host2;
    var nameless = new Duck();
    nameless.set({
        age:1,
        height: '60cm'
    });
    ok(Math.abs(nameless.height.meters-0.6)<0.0001);
    equal(nameless.age,1);
    ok(!nameless.canDrink());

});

// FIXME:  spec - to - (order)
test('2.j basic Set functions (string index)',function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost= host2;
    var hueyClone = new Duck({age:2});
    var deweyClone = new Duck({age:1});
    var louieClone = new Duck({age:3});
    var clones = new Nest();
    clones.addObject(louieClone);
    clones.addObject(hueyClone);
    clones.addObject(deweyClone);
    var sibs = clones.list(function(a,b){return a.age - b.age;});
    strictEqual(sibs[0],deweyClone);
    strictEqual(sibs[1],hueyClone);
    strictEqual(sibs[2],louieClone);
    var change = {};
    change[hueyClone.spec()] = 0;
    clones.change(change);
    var sibs2 = clones.list(function(a,b){return a.age - b.age;});
    equal(sibs2.length,2);
    strictEqual(sibs2[0],deweyClone);
    strictEqual(sibs2[1],louieClone);
});

test('2.k distilled log', function (test) {
    function logSize(obj) {
        var log = obj._oplog, cnt=0;
        for(var key in log) { // jshint ignore:line
            cnt++;
        }
        return cnt;
    }
    console.warn(QUnit.config.current.testName);
    env.localhost= host2;
    var duckling1 = host2.get(Duck);
    duckling1.set({age:1});
    duckling1.set({age:2});
    duckling1.distillLog();
    equal(logSize(duckling1),1);
    duckling1.set({height:'30cm',age:3});
    duckling1.set({height:'40cm',age:4});
    duckling1.distillLog();
    equal(logSize(duckling1),1);
    duckling1.set({age:5});
    duckling1.distillLog();
    equal(logSize(duckling1),2);
});

test('2.l partial order', function (test) {
    env.localhost= host2;
    var duckling = new Duck();
    duckling.deliver(new Spec(duckling.spec()+'!time+user2.set'),{height:'2cm'});
    duckling.deliver(new Spec(duckling.spec()+'!time+user1.set'),{height:'1cm'});
    equal(duckling.height.toString(), '2cm');
});

asyncTest('2.m init push', function (test) {
    env.localhost= host2;
    var scrooge = new Duck({age:105});
    scrooge.onStateReady(function check() {
        var tail = storage2.tails[scrooge.spec()];
        // FIXME equal(scrooge._version.substr(1), scrooge._id);
        var op = tail && tail[scrooge._version+'.set'];
        ok(tail) && ok(op) && equal(op.age,105);
        start();
    });
});

test('2.n local listeners for on/off', function () {
    console.warn(QUnit.config.current.testName);
    expect(3);
    env.localhost= host2;
    var duck = new Duck();
    duck.on('.on', function duckOnHandler(spec, val) {
        // +2
        // not triggered by itself (notification of source prevented)
        console.log('triggered by duck.on and host2.on below');
        equal(spec.op(), 'on');
    });
    duck.onStateReady(function gotit(){
        // +1
        console.log('inevitable');
        ok(duck._version);
    });
    duck.on('.reon', function duckReonHandler(spec, val) {
        console.warn("must NOT get triggered if the storage is sync");
        equal(spec.op(), 'reon');
    });
    host2.on('/Duck#' + duck._id + '.on', function hostDuckOnHandler(spec, val) {
        console.log('must NOT get triggered (no notification of operation source)');
        equal(spec.op(), 'on');
    });
});

/*  TODO
 * test('2.m on/off sub', function (test) {
    env.localhost= host2
    var duckling = new Duck();

    expect(2);
    duckling.on('on',function(spec){
        ok(spec.op(),'on');
    });
    duckling.on('set',function(spec){
        equal(spec.op(),'set');
    });
    duckling.set({age:1});

});*/
