const STORAGE_KEY="english_trainer_v2";

const DEFAULT_DATA={progress:{mode:"vocab",session:1,index:0},answers:{},wrong:[],bookmarks:[],memo:{},settings:{shuffle:false,shuffleChoice:true,dark:false,autoNext:true}};

function loadStorage(){try{const d=JSON.parse(localStorage.getItem(STORAGE_KEY));if(!d){saveStorage(DEFAULT_DATA);return structuredClone(DEFAULT_DATA);}return Object.assign(structuredClone(DEFAULT_DATA),d);}catch(e){console.error(e);saveStorage(DEFAULT_DATA);return structuredClone(DEFAULT_DATA);}}

function saveStorage(data){localStorage.setItem(STORAGE_KEY,JSON.stringify(data));}

function makeID(mode,session,index){return`${mode}-${session}-${index}`;}

function saveAnswer(mode,session,index,correct){const d=loadStorage(),id=makeID(mode,session,index);if(!d.answers[id])d.answers[id]={try:0,correct:0,wrong:0};d.answers[id].try++;if(correct){d.answers[id].correct++;d.wrong=d.wrong.filter(v=>v!==id);}else{d.answers[id].wrong++;if(!d.wrong.includes(id))d.wrong.push(id);}saveStorage(d);}

function getAnswer(mode,session,index){return loadStorage().answers[makeID(mode,session,index)]||{try:0,correct:0,wrong:0};}

function toggleBookmark(mode,session,index){const d=loadStorage(),id=makeID(mode,session,index),i=d.bookmarks.indexOf(id);if(i==-1)d.bookmarks.push(id);else d.bookmarks.splice(i,1);saveStorage(d);}

function isBookmarked(mode,session,index){return loadStorage().bookmarks.includes(makeID(mode,session,index));}

function getBookmarks(){return loadStorage().bookmarks;}

function saveMemo(mode,session,index,text){const d=loadStorage();d.memo[makeID(mode,session,index)]=text;saveStorage(d);}

function getMemo(mode,session,index){return loadStorage().memo[makeID(mode,session,index)]||"";}

function saveProgress(mode,session,index){const d=loadStorage();d.progress={mode,session,index};saveStorage(d);}

function getProgress(){return loadStorage().progress;}

function setSetting(key,value){const d=loadStorage();d.settings[key]=value;saveStorage(d);}

function getSetting(key){return loadStorage().settings[key];}

function getWrongList(){return loadStorage().wrong;}

function clearWrongList(){const d=loadStorage();d.wrong=[];saveStorage(d);}

function getStatistics(){const d=loadStorage();let total=0,correct=0,wrong=0;Object.values(d.answers).forEach(v=>{total+=v.try;correct+=v.correct;wrong+=v.wrong;});return{total,correct,wrong,rate:total?Math.round(correct/total*100):0};}

function resetStorage(){localStorage.removeItem(STORAGE_KEY);}
