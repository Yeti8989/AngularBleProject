import { Component, OnInit } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule, HttpClient, HttpHeaders, HttpErrorResponse, HttpEvent, HttpSentEvent, HttpResponse} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { forkJoin, Observable, concat } from 'rxjs';
import { Angular5Csv } from 'angular5-csv/dist/Angular5-csv'
import { Inject } from '@angular/core';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA, ShowOnDirtyErrorStateMatcher} from '@angular/material';
import { DialogComponent } from '../../dialog/dialog.component';

//patch class
//type is always "random"
class Patch {
  public patchName;
  public patchAddr;
  public type;
  public passkey;
  public data = [];
  constructor(name:string, bdaddr:string, type:string, passkey:string){
    this.patchName = name
    this.patchAddr = bdaddr
    this.type = type
    this.passkey = passkey
  }
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})

export class HomeComponent implements OnInit {

  constructor(private http: HttpClient, private dialog: MatDialog) { }
  // YOU MUST BE CONNECTED TO THE ROUTER'S WIFI FOR THE PROGRAM TO WORK
  title = 'Server Patch Connection Tool';
  //Uuids if ever needed
  // streamcharacteristicUuids  = ["7d1700021b9e4dc3459524428868e680"];
  // commandcharacteristicUuids = ["7d1700031b9e4dc3459524428868e680"];
  streamingService:string = '7d170001-1b9e-4dc3-4595-24428868e680';
  connectNum = 0;
  //This is just used to keep track of what is happening now
  CurrentStage : any;
  //Event sources that allow the program to do things when the router recieves a message or scans a new device
  //Scan source monitors the BLE signals that the router sees and notify source should supposedly see any messages 
  // the devices send the router
  scanSource:EventSource;
  notifySource:EventSource;
  stateChangeSource:EventSource;
  //These things keep track of what patches are connected, their MACs, paired, and their passkeys
  patchNameArray:Array<string> = [];
  pairedArray:Array<Patch> = [];
  connectedArray:Array<Patch> = [];
  patchArray:Array<Patch> = [];
  pairedPatchNameArray:Array<string> = [];
  //This is the string of all the names of the connected patches
  connectionList = "";
  //Handle number and Router IP variable connected to the textboxes
  handle = "";
  RouterIP = ""
  //These variables are kind of useless
  isReady:Boolean = true;
  //Need these for any post command
  headers = { headers: new HttpHeaders({'Content-Type' : 'application/json'})};
  isStreaming = 0
  csvArray = []

//creates the dialog to connect a patch
  connectDialog(){
    let dialogRef = this.dialog.open(DialogComponent, { width : '500px', height : '500px', data:this.patchArray})
    dialogRef.afterClosed().subscribe(result =>{
      if(result){
        console.log('Chosen Patch: ' + result.patchName)
        this.connectToPatch(this.RouterIP,result)
      }
    });
  }

  //creates the dialog to pair a patch
  pairDialog(){
    let dialogRef = this.dialog.open(DialogComponent, { width : '500px', height : '500px', data:this.connectedArray})
    dialogRef.afterClosed().subscribe(result =>{
      if(result){
        console.log('Chosen Patch: ' + result.patchName)
        this.pairToPatch(this.RouterIP,result)
      }
    });
  }

  //This function happens when the "Connect" button is clicked, it starts the event sources and 
  // connects to any patch that fulfills all the requirements of the first if statement
  scan(RouterIP:string){
    this.CurrentStage = "Looking";
    //These URLs can be put into your internet browser to watch the data stream as long as you replace "RouterIP" with the actual IP
    this.scanSource = new EventSource('http://' + RouterIP + '/gap/nodes/?active=1&event=1&mac=');
    this.notifySource = new EventSource('http://' + RouterIP + '/gatt/nodes/?event=1&mac=&access_token=');
    this.stateChangeSource = new EventSource('http://' + RouterIP + '/management/nodes/connection-state?mac=');
    this.patchNameArray = []
    this.patchArray = []
    this.connectNum = 0
    
    //This is what happens when the router sees a device
    this.scanSource.addEventListener('message', message => {
      let me:any = message;
      var data = JSON.parse(me.data);
      let name:string = data.name;
      if(name && name.match('Patch-') && !this.patchNameArray.includes(name)){
        this.patchNameArray.push(name)
        let patch = new Patch('Patch-' + name.slice(name.length-4), data.bdaddrs[0].bdaddr, 'random', this.keyCreator(name.slice(name.length-4)))
        this.patchArray.push(patch)
        this.connectNum++;
        }
    });

    //this Event Source listens for any data that the patches send to the router
    //message contains the sample data, the mac address of the device that sent it, and the handle
    //it came from
    this.notifySource.addEventListener('message', message => {
      let data = JSON.parse(message.data)
      this.CurrentStage = data
      let patch:Patch
      for(let i = 0; i < this.pairedArray.length; i++){
        if(data.id === this.pairedArray[i].patchAddr){
          patch = this.pairedArray[i]
        }
      }
      //patch streaming handle
      if(data.handle == 13){
        if(data.value[4] === '0'){
          //starts the timestamp data at the epoch (1970)
          let seconds = Number.parseInt(data.value.slice(0,8),16)
          console.log(seconds)
          let timeStamp = new Date(0)
          timeStamp.setSeconds(seconds)
          console.log(timeStamp)
          let LOI = Number.parseInt(data.value.slice(20,24),16) * (500 / 65535)
          console.log(LOI)
          //add the data to the patch's data list
          patch.data.push([timeStamp,LOI])
        }
      }

    });
    //This EventSource listens for whenever a device is connected or disconnected
    //message contains the mac address for the device (data.handle)
    this.stateChangeSource.addEventListener('message', message => {
      let me:any = message;
      var data = JSON.parse(me.data);
      let device:string = data.handle;
      let connectionState:string = data.connectionState;
      //Every time a device is connected
      if(connectionState === "connected"){
      }
      //Every time a device is disconnected
      if(connectionState === "disconnected"){
        console.log("Patch Disconnected")
        console.log(data)
        let tempArray = []
        //remove the patch from the list of connected patches
        this.connectedArray.forEach((patch:Patch) =>{
          console.log(patch.patchAddr)
          console.log(data.handle)
          if(patch.patchAddr === data.handle){
            console.log(patch.patchName + " was disconnected unintentionally")
            this.connectToPatch(this.RouterIP, patch)
          }
          else{
            tempArray.push(patch)
          }
        })
        this.connectedArray = tempArray
        this.connectedListUpdate
      }
    });
  }

  //This function pairs to all patches that have been connected, it almost always needs to be run twice to pair anything
  pairToPatch(RouterIP:string, patch:Patch):void{
    this.CurrentStage = "Pairing";
    console.log("Beginning pairing process");
      console.log("Pairing to " + patch.patchName + " with passkey " + patch.passkey);
      //This first post initiates the pairing process, the server will then wait for a second post with the passkey
      let newPair = this.http.post('http://' + RouterIP + '/management/nodes/' + patch.patchAddr +'/pair?&access_token=', 
      JSON.stringify({"bond":1, "legacy-oob":0, "io-capability":"KeyboardOnly"}), this.headers);
      newPair
      .subscribe(
        //forkJoin return an object filled will all the responses from the server 
        (response:any) =>{
          //5 == needs passkey
          if(response.pairingStatusCode === 5){
            this.sendPasskey(patch);
          }
          //1 == pair successful, should not happen here
          else if(response.pairingStatusCode === 1){
            console.log("Pairing to " + patch.patchName + " Successful");
            this.pairedArray.push(patch)
            this.http.get('http://' + RouterIP + '/gatt/nodes/' + patch.patchAddr + '/handle/14/value/0100/?mac=').subscribe();
            this.http.get('http://' + RouterIP + '/gatt/nodes/' + patch.patchAddr + '/handle/17/value/0100/?mac=').subscribe();
          }
          //0 == failure
          else{
            console.log("Pairing to " + patch.patchName + " Failed" )
          }
        },
        (error:any) =>{
          if(error.pairingStatusCode === 5){
            this.sendPasskey(patch);
          }
          else if(error.pairingStatusCode === 1){
            console.log("Pairing to " + patch.patchName + " Successful");
          }
          else{
            console.log("Pairing to " + patch.patchName + " Failed" )
          }
        }
      );
  }

  //displays the patches that are connected everytime one is added or deleted
  connectedListUpdate(){
    this.connectionList = "";
    this.connectedArray.forEach((patch:Patch) => {
      this.connectionList = this.connectionList +"\n" + patch.patchName ;
    });
  }

  //sends the passkey to the Router to pair a patch
  sendPasskey(patch:Patch){
    //this second post sends the passkey over to the router for pairing, this usually fails the first time
    let PairInput = this.http.post('http://' + this.RouterIP + '/management/nodes/' + patch.patchAddr +'/pair-input?&access_token=',
    //get the passkey from the map and send it in a post command
    JSON.stringify({"passkey": patch.passkey}), this.headers);
    PairInput.subscribe(
      (resp:any) =>{
        if(resp.pairingStatusCode === 0){
          this.sendPasskey(patch);
        }
        else if(resp.pairingStatusCode === 1){
          //keep track of what patches are paired
          console.log("Passkey Send Successful");
          if(!this.pairedPatchNameArray.includes(patch.patchName)){
            this.pairedArray.push(patch)
            this.pairedPatchNameArray.push(patch.patchName)
          }
          this.http.get('http://' + this.RouterIP + '/gatt/nodes/' + patch.patchAddr + '/handle/14/value/0100/?mac=').subscribe();
          this.http.get('http://' + this.RouterIP + '/gatt/nodes/' + patch.patchAddr + '/handle/17/value/0100/?mac=').subscribe();
        }
        else if(resp.pairingStatusCode === 2){
          console.log("Passkey Send Failed")
        }
      }
    );
  }
  //get characteristics for the profusa streaming service for EVERY patch
  getCharacteristics(IP:string){
    this.CurrentStage = "Getting Characteristics"
    this.pairedArray.forEach((patch:Patch)=> {
      this.http.get('http://'+ IP + '/gatt/nodes/'+ patch.patchAddr + '/services/'+ this.streamingService+'/characteristics?mac=&access_token=').subscribe( 
        (data:JSON) =>{
          console.log(data);
        }
      );
    });
  }

  //this function connects to a single patch, as of now it automatically pairs to patch upon successful 
  //connection unless sampling has already started
  connectToPatch(IP:string, patch:Patch):void{
    console.log(patch)
    if(patch !== undefined){
      this.isReady = false;
      this.CurrentStage = "Connecting";
      //this post has never not worked, even when the server returns an error, the post worked weirdly enough
      let newConnection = this.http.post('http://' + IP + '/gap/nodes/' + patch.patchAddr + '/connection/?mac=&access_token=', 
      JSON.stringify({"type" : patch.type, "timeout": "20000", "auto": "1"}), this.headers);
      newConnection
      .subscribe( 
        (response:Object) =>{
          console.log(response)
        },
        (error:HttpErrorResponse) =>{
          if(error.status === 200){
            console.log("Connection to " + patch.patchName + " Succeeded")
            this.connectedArray.push(patch)
            this.connectedListUpdate()
            if(this.isStreaming === 0){
              this.pairToPatch(this.RouterIP,patch)
            }
            this.CurrentStage = "Connected"
          }
          else {
            console.log("Connection to " + patch.patchName + " Failed")
            if(this.isStreaming === 1){
              this.connectToPatch(IP, patch)
            }
          }
        }
      );
      //Display the patches that are connected
      this.connectedListUpdate();
      this.isReady = true;
    }
  }
//Only disconnects a single patch, this function is bound to the Disconnect button on the paired patch list
//As of now if this feature is used the router will auto reconnect the patch
  disconnectOne(patch:Patch){
    this.http.delete('http://' + this.RouterIP + '/gap/nodes/' + patch.patchAddr + '/connection/?mac=&access_token=').subscribe();
    let tempArray = []
    this.pairedArray.forEach((pairedPatch:Patch) =>{
      if(patch.patchName !== pairedPatch.patchName){
        tempArray.push(patch)
      }
    })
    this.pairedArray = tempArray
  }

  //get the services of all the connected patches
  //I might convert this into an individual patch thing
  getServices(IP:String){
    this.CurrentStage = "Getting Services";
    this.pairedArray.forEach((patch:Patch)=> {
      this.http.get('http://'+ IP + '/gatt/nodes/'+ patch.patchAddr + '/services?mac=&access_token=').subscribe( 
        (data:JSON) => {
          console.log(data);
        }
      );
    });
  }

  //this function turns notifications on for the patch and then get its status but it does not do that
  //starts every paired patch and starts their timestamps at the EPOCH, 
  //HITTING IT MORE THAN ONCE WILL CAUSE DUPLICATE DATA
  startStreaming(IP:String){
    this.CurrentStage = "Streaming?";
    this.isStreaming = 1
    for(let i = 0; i < this.pairedArray.length; i++){
      let patch = this.pairedArray[i]
      let streamingValue = '030100000000'
      if(this.pairedArray.includes(patch)){
        //first two open notifications for the command and stream caharacteristics, the third sends the get status command
        this.http.get('http://' + IP + '/gatt/nodes/' + patch.patchAddr + '/handle/16/value/'+streamingValue + '?noresponse=1').subscribe(
          (data:JSON)=>{
            console.log(data)
          }
        );
      }
    }
  }

  //tell all patches to stop sampling
  stopStreaming(IP:String){
    this.CurrentStage = "Streaming?";
    this.isStreaming = 0
    for(let i = 0; i < this.pairedArray.length; i++){
      let patch = this.pairedArray[i]
      let streamingValue = '030000000000'
      if(this.pairedArray.includes(patch)){
        //first two open notifications for the command and stream caharacteristics, the third sends the get status command
        this.http.get('http://' + IP + '/gatt/nodes/' + patch.patchAddr + '/handle/16/value/'+streamingValue + '?noresponse=1').subscribe(
          (data:JSON)=>{
            console.log(data)
          }
        );
      }
    }
  }

  //check the value of the handle specified in the text box important ones are 14 and 17 as they are the notify values
  //checks for EVERY connected patch
  checkHandle(){
    this.connectedArray.forEach((patch:Patch)=> {
      this.http.get('http://' + this.RouterIP + '/gatt/nodes/' + patch.patchAddr + '/handle/'+ this.handle + '/value?mac=&access_token=&option=cmd' ).subscribe(
        (data:JSON) => {
          console.log(data);
        }
      );
    });
  }

//creates the 6 number passkey from the patches ID right before connection
//or grabs the passkey for the patch assuming that the I've used the patch before
  keyCreator(digits:string):string{
    let passkey = "2";
    if(digits.length !== 4){
      console.log("Bro something's wrong with the key");
    }
    for(let i = 0; i<digits.length; i++){
      let newChar = '';
      let nextChar = digits.charAt(i);
      if(!isNaN(Number.parseInt(nextChar))){
        newChar = digits.charAt(i);
      }
      else{
        switch(nextChar){

          case('A'):
            newChar = '0';
          break;

          case('B'):
            newChar = '1';
          break;

          case('C'):
            newChar = '2';
          break;

          case('D'):
            newChar = '3';
          break;

          case('E'):
            newChar = '4';
          break;

          case('F'):
            newChar = '5';
          break;
        }
      }
      passkey = passkey.concat(newChar);
    }

    if(digits === "3E43"){
      console.log(digits)
      return "100087"
    }
    else if(digits === "4E79"){
      console.log(digits)
      return "100047"
    }
    else if(digits === "EE62"){
      console.log(digits)
      return "244623"
    }
    else if(digits === "CC03"){
      console.log(digits)
      return "222033"
    }
    else if(digits === "5594"){
      console.log(digits)
      return "100070"
    }
    else if(digits === "F446"){
      console.log(digits)
      return "254463"
    }
    else if(digits === "412F"){
      console.log(digits)
      return "100081"
    }
    else if(digits === "37B0"){
      console.log(digits)
      return "100038"
    }
    else if(digits === "1CBE"){
      console.log(digits)
      return "100057"
    }
    else if(digits === "4528"){
      console.log(digits)
      return "100007"
    }
    else if(digits === "E8D2"){
      console.log(digits)
      return "100065"
    }
    else if(digits === "547C"){
      console.log(digits)
      return "100034"
    }
    else if(digits === "DAD5"){
      console.log(digits)
      return "100100"
    }
    else if(digits === "E55F"){
      console.log(digits)
      return "100086"
    }
    else if(digits === "4801"){
      console.log(digits)
      return "100068"
    }
    else if(digits === "0964"){
      console.log(digits)
      return "100085"
    }
    else if(digits === "2B37"){
      console.log(digits)
      return "100051"
    }
    else if(digits === "9BC5"){
      console.log(digits)
      return "100002"
    }
    else if(digits === "C058"){
      console.log(digits)
      return "100019"
    }
    else if(digits === "6D5A"){
      console.log(digits)
      return "100044"
    }
    else if(digits === "0B92"){
      console.log(digits)
      return "100017"
    }
    else if(digits === "DC70"){
      console.log(digits)
      return "232703"
    }
    else if(digits === "FBD0"){
      console.log(digits)
      return "100079"
    }
    else if(digits === "0CD9"){
      console.log(digits)
      return "100040"
    }
    else if(digits === "B97B"){
      console.log(digits)
      return "219713"
    }
    else if(digits === "F58E"){
      console.log(digits)
      return "255843"
    }
    else if(digits === "E754"){
      console.log(digits)
      return "247543"
    }
    else if(digits === "5357"){
      console.log(digits)
      return "100092"
    }
    else if(digits === "7172"){
      console.log(digits)
      return "100043"
    }
    else if(digits === "E525"){
      console.log(digits)
      return "100074"
    }
    else if(digits === "29D5"){
      console.log(digits)
      return "100069"
    }
    else if(digits === "1263"){
      console.log(digits)
      return "100062"
    }
    else if(digits === "BABE"){
      console.log(digits)
      return "100067"
    }
    else if(digits === "5F8D"){
      console.log(digits)
      return "100037"
    }
    else if(digits === "B1A6"){
      console.log(digits)
      return "100059"
    }
    else if(digits === "2205"){
      console.log(digits)
      return "100093"
    }
    else if(digits === "0270"){
      console.log(digits)
      return "100088"
    }
    else if(digits === "1816"){
      console.log(digits)
      return "100004"
    }
    else if(digits === "2B3D"){
      console.log(digits)
      return "100035"
    }
    else if(digits === "79C7"){
      console.log(digits)
      return "100032"
    }
    else if(digits === "EF5F"){
      console.log(digits)
      return "100025"
    }
    else if(digits === "0AF2"){
      console.log(digits)
      return "100020"
    }
    else if(digits === "9483"){
      console.log(digits)
      return "100066"
    }
    else if(digits === "D643"){
      console.log(digits)
      return "100010"
    }
    else if(digits === "51C4"){
      console.log(digits)
      return "100054"
    }
    else if(digits === "C76F"){
      console.log(digits)
      return "100023"
    }
    else if(digits === "A24E"){
      console.log(digits)
      return "100001"
    }
    else if(digits === "B2C8"){
      console.log(digits)
      return "495936"
    }
    else if(digits === "C9E0"){
      console.log(digits)
      return "258800"
    }
    else if(digits === "EBD3"){
      console.log(digits)
      return "772830"
    }
    else if(digits === "CBC0"){
      console.log(digits)
      return "100046"
    }
    else if(digits === "3C3E"){
      console.log(digits)
      return "100058"
    }
    else if(digits === "FC1A"){
      console.log(digits)
      return "100015"
    }
    passkey = passkey.concat('3');
    return "100055";
  }

  //Unpairs all paired patches
  unpair(IP:string){
    this.CurrentStage = "Unpairing";
    this.pairedArray.forEach(( patch:Patch )=> {
      this.CurrentStage = 'Unpairing from ' + patch.patchName;
      this.http.delete('http://' + IP + '/management/nodes/' + patch.patchAddr + '/bond?&access_token=').subscribe();
    });
  }

  //Disconnects all connected patches from the router
  //Clears all stored data and patch statuses
  disconnect(IP:string){
    this.CurrentStage = "Disconnecting"
    this.scanSource.close();
    this.notifySource.close();
    this.connectedArray.forEach((patch:Patch)=> {
      this.connectedArray
      this.CurrentStage = 'Disconnecting from ' + patch.patchName;
      this.http.delete('http://' + IP + '/gap/nodes/' + patch.patchAddr + '/connection/?mac=&access_token=').subscribe();
      this.connectNum = 0;
    });
    this.pairedPatchNameArray = [];
    this.connectedArray = [];
    this.pairedArray = [];
    this.patchArray = [];
    this.patchNameArray = [];
    this.csvArray = [];
    this.connectedListUpdate();
  }
//exports all currently gathered data to a csv file
export(){
  this.csvArray.sort((a, b) => a.patchName < b.patchName ? -1 : a.patchName > b.patchName ? 1 : 0);
  for(let i = 0; i < this.pairedArray.length; i++){
    let patch = this.pairedArray[i]
    console.log(patch.data.length)
    for(let j = 0; j < patch.data.length; j++){
      console.log(j)
      this.csvArray.push([i, patch.patchName, patch.data[j][0], patch.data[j][1]])
    }
  }
  new Angular5Csv( this.csvArray, 'My Report', {headers : ["ID", "Patch Name", "Time Stamp", "LOI"]})
}
//writes values to a single handle of a single patch
writeVal(patch:Patch, handle:string, value:string, response:string){
  this.http.get('http://' + this.RouterIP + '/gatt/nodes/' + patch.patchAddr + '/handle/' + handle + '/value/'+ value + '?noresponse=' + response).subscribe(
    (data:JSON)=>{
      console.log(data)
    }
  );
}

  ngOnInit() {
  }
}
