import { Component, OnInit, Inject } from '@angular/core';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';

@Component({
  selector: 'app-dialog',
  templateUrl: './dialog.component.html',
  styleUrls: ['./dialog.component.scss']
})
export class DialogComponent implements OnInit {
  returnData:any = ''
  currentPatch = ''
  constructor(public dialogRef: MatDialogRef<DialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Array<any>) { }

  ngOnInit() {
    this.data.sort((a, b) => a.patchName < b.patchName ? -1 : a.patchName > b.patchName ? 1 : 0);
  }

  onNoClick(): void {
    this.dialogRef.close();
  }

  setReturn(data:any){
    this.returnData = data;
    this.currentPatch = this.returnData.patchName
  }


}
