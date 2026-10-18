Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
baseDir = fso.GetParentFolderName(scriptDir)
pythonExe = "C:\Python314\pythonw.exe"
If Not fso.FileExists(pythonExe) Then
    pythonExe = "pythonw.exe"
End If
serviceScript = scriptDir & "\run_fastapi_service.py"
WshShell.CurrentDirectory = baseDir
WshShell.Run """" & pythonExe & """ """ & serviceScript & """", 0, False
