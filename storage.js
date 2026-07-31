const STORAGE_KEY="english_trainer_v2";

const DEFAULT_DATA={progress:{mode:"vocab",session:1,index:0},answers:{},wrong:[],bookmarks:[],memo:{},settings:{shuffle:false,shuffleChoice:true,dark:false,autoNext:true}};

function loadStorage(){try{const d=JSON.parse(localStorage.getItem(STORAGE_KEY));if(!d){saveStorage(DEFAULT_DATA);return structuredClone(DEFAULT_DATA);}return Object.assign(structuredClone(DEFAULT_DATA),d);}catch(e){console.error(e);saveStorage(DEFAULT_DATA);return structuredClone(DEFAULT_DATA);}}

function saveStorage(data){localStorage.setItem(STORAGE_KEY,JSON.stringify(data));}

function makeID(mode,session,index){return`${mode}-${session}-${index}`;}

function saveProgress(mode,session,index){const d=loadStorage();d.progress={mode,session,index};saveStorage(d);}

function getProgress(){return loadStorage().progress;}

function setSetting(key,val){const d=loadStorage();d.settings[key]=val;saveStorage(d);}

function getSetting(key){return loadStorage().settings[key];}
