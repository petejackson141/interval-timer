   @echo off
   cd /d C:\Users\Pete\interval-timer
   git add .
   set /p msg=Describe this change: 
   git commit -m "%msg%"
   git push
   npx cap sync android
   echo.
   echo Done. Now press Run in Android Studio.
   pause