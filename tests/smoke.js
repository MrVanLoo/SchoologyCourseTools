const core=require('../skills/common-cartridge/scripts/core.js');const JSZip=require('../skills/common-cartridge/scripts/vendor/jszip.min.js');const {marked}=require('../skills/common-cartridge/scripts/vendor/marked.min.js');const fs=require('fs');fs.mkdirSync(__dirname+'/out',{recursive:true});
const spec={title:'Smoke',items:[
{unit:'Unit 1',topic:'Topic A',type:'Assignment',title:'Bridge',description:'Build a **bridge**.\n\n- one\n- two',points:20,due:'11/20/2026',category:'Projects',rubric:'Bridge rubric'},
{unit:'Unit 1',topic:'Topic A',type:'Link',title:'Video',url:'youtube.com/watch?v=1&t=2'},
{unit:'Unit 1',topic:'Topic A',type:'Page',title:'Notes',description:'<p>Hello</p>'},
{unit:'Unit 1',topic:'Topic B',type:'Discussion',title:'Talk',description:'Discuss.'},
{unit:'Unit 1',topic:'Topic B',type:'File',title:'Handout',file:'h.pdf'},
{unit:'Unit 2',topic:'',type:'Quiz',title:'Quiz 1'}],
rubrics:[{name:'Bridge rubric',criteria:[{title:'Strength',description:'Holds load',levels:[{points:10,description:'Great'},{points:5,description:'OK'},{points:0,description:'No'}]},{title:'Design',levels:[{points:10,description:'Great'},{points:5,description:'OK'},{points:0,description:'No'}]}]}],
quizzes:[{title:'Quiz 1',questions:[{type:'mc',prompt:'2+2?',choices:['3','4'],correct:[1]},{type:'mr',prompt:'Evens & <odd>?',choices:['2','3','4'],correct:[0,2]},{type:'tf',prompt:'Sky blue',answers:['true']},{type:'fib',prompt:'Capital of MI',answers:['Lansing']},{type:'essay',prompt:'Explain'},{type:'matching',prompt:'Match'}]}]};
const r=core.build(core.fromSpec(spec),{title:spec.title,marked,files:{'h.pdf':Buffer.from('%PDF-1.4 x')}});
console.log(JSON.stringify(r.report,null,1));
core.zip(JSZip,r.files,'nodebuffer').then(b=>{fs.writeFileSync(__dirname+'/out/smoke.imscc',b);fs.writeFileSync(__dirname+'/out/smoke_checklist.html',r.checklistHtml);console.log(r.files['R_0001/index.html'])});
// Added: fail loudly instead of only printing.
if (r.report.errors.length) { console.error('smoke: build reported errors'); process.exit(1); }
['imsmanifest.xml', 'R_0001/index.html', 'R_0002/weblink.xml', 'R_0004/discussion.xml', 'R_0005/h.pdf', 'R_0006/assessment_qti.xml'].forEach(function (f) {
  if (!(f in r.files)) { console.error('smoke: missing ' + f); process.exit(1); }
});
