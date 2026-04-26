$ErrorActionPreference = 'Stop'

$python = 'C:\Users\Itzhak\AppData\Local\Programs\Python\Python310\python.exe'
$script = 'C:\Users\Itzhak\.openclaw\workspace\skills\google-photos\scripts\gphotos.py'
$credentials = 'C:\Users\Itzhak\.openclaw\workspace\credentials.json'
$token = 'C:\Users\Itzhak\.openclaw\workspace\token_photos.pickle'

& $python $script --action auth-status --credentials $credentials --token $token
