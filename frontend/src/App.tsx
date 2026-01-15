// frontend/src/App.tsc

import React from 'react';
import Lesson from './components/Lesson';


function App(){
  return(
    <div>
      <h1 style={{textAlign: "center"}}>AI Language Tutor</h1>
      <Lesson />
    </div>
  );
}

export default App;