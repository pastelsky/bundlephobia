(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=react && echo '\n') &
sleep 3
(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=preact && echo '\n') &
sleep 3
(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=d3 && echo '\n') &
sleep 3
(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=c3 && echo '\n') &
sleep 3
(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=inferno && echo '\n') &
sleep 3
(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=react-router && echo '\n') &
sleep 3
(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=localforage && echo '\n') &
sleep 3
(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=request && echo '\n') &
sleep 3
(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=lodash && echo '\n') &
sleep 3
(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=moment && echo '\n') &
sleep 3
(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=antd && echo '\n') &
sleep 3
(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=vue && echo '\n') &
sleep 3
(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=react-clipboard && echo '\n') &
sleep 3
(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=react-ink && echo '\n') &
sleep 3
(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=glamorous && echo '\n') &
sleep 3
(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=preact-compat && echo '\n') &
sleep 3
(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=inferno-compat && echo '\n') &
sleep 3
(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=immutable && echo '\n') &
sleep 3
(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=redux && echo '\n') &
sleep 3
(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=mobx && echo '\n') &
sleep 3
(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=mobx-react && echo '\n') &
sleep 3
(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=styled-components && echo '\n') &
wait
#sleep 5
#(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=backbone && echo '\n') &
#sleep 5
#(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=jquery && echo '\n') &
#sleep 5
#(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=formik && echo '\n') &
#sleep 5
#(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=animejs && echo '\n') &
#sleep 5
#(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=three && echo '\n') &
#sleep 5
#(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=babylonjs && echo '\n') &
#sleep 5
#(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=emotion && echo '\n') &
#sleep 5
#(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=react-treeview && echo '\n') &
#sleep 5
#(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=react-bootstrap && echo '\n') &
#sleep 5
#(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=vuex && echo '\n') &
#sleep 5
#(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?package=mojs && echo '\n') &
#sleep 5
#(curl -o /dev/null -s -w %{time_total} localhost:5000/api/size?normalize.css && echo '\n') &
